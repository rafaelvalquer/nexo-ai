import path from "node:path";
import type {AgentIntent,DeferredAction} from "../agent/orchestrator/intent-schema.js";
import type {ToolRegistry} from "../tools/registry.js";
import {LocationRegistry} from "../locations/location-registry.js";
import {PathIntentResolver} from "../locations/path-intent-resolver.js";
import type {CanonicalIntent} from "./types.js";
import type {LocalMetricsService} from "../observability/metrics.js";
import {CanonicalActionPlanner} from "../agent/action-planning/canonical-action-planner.js";
import type {CanonicalIntentDecision} from "../agent/action-planning/canonical-intent-decision.js";
import {stableCandidateId} from "../agent/decision/semantic-action-identity.js";

export type MappedHybridIntent=
  |{type:"tool";tool:string;input:Record<string,unknown>;explanation:string;responseMode:"deterministic"|"presentation"|"synthesize";intent:AgentIntent;deferredAction?:DeferredAction}
  |{type:"clarification";question:string;intent:AgentIntent}
  |{type:"unknown";reason:string};

export type MappedHybridDecision=
  |{type:"decision";decision:CanonicalIntentDecision;intent:AgentIntent}
  |{type:"clarification";question:string;intent:AgentIntent}
  |{type:"unknown";reason:string};

export type ScopeResolution=
  |{status:"absent"}
  |{status:"resolved";path:string;raw:string}
  |{status:"unresolved";raw:string;reason:"UNKNOWN_ALIAS"|"NOT_ALLOWED"|"AMBIGUOUS_LOCATION"};

export class IntentToolMapper{
  constructor(private readonly registry:ToolRegistry,private readonly allowedRoots:()=>string[],private readonly metrics?:LocalMetricsService){}

  decision(intent:CanonicalIntent):MappedHybridDecision{
    const agentIntent=toAgentIntent(intent);
    const entities=Object.fromEntries(Object.entries(intent.entities).map(([key,entry])=>[key,entry.value]));
    if(intent.domain==="filesystem"){
      const scoped=this.resolveScope(intent);
      if(scoped.status==="unresolved")return this.scopeClarification(agentIntent,scoped.raw);
      if(scoped.status==="resolved"){
        if(intent.operation==="find_file"||intent.operation==="write_text_file")entities.root=scoped.path;
        else entities.folder=scoped.path;
      }
      if(["read_file","file_info","copy_file","move_file","rename_file","trash_file"].includes(intent.operation)){
        const physicalKeys=intent.operation==="copy_file"||intent.operation==="move_file"?["source","destination"]:["path"];
        for(const key of physicalKeys){
          const value=typeof entities[key]==="string"?String(entities[key]):undefined;
          if(value&&!isAbsolutePortable(value))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        }
      }
    }
    const base={
      source:"hybrid" as const,domain:intent.domain,operation:intent.operation,entities,
      missing:intent.missing??[],ambiguities:intent.ambiguities?.map(item=>item.code)??[],
      confidence:intent.diagnostics?.rawModelConfidence??.9,proposedTool:intent.operation,
      mutatesState:["create","update","delete"].includes(intent.intent),evidence:["hybrid-intent"]
    };
    const decision:CanonicalIntentDecision={
      candidateId:stableCandidateId(base as any),
      domain:canonicalDomain(intent.domain),operation:intent.operation,entities,
      confidence:intent.diagnostics?.rawModelConfidence??.9,source:"hybrid",evidence:["hybrid-intent"]
    };
    return{type:"decision",decision,intent:agentIntent};
  }

  /** @deprecated Use decision() + CanonicalActionPlanner.planDecision(). */
  map(intent:CanonicalIntent):MappedHybridIntent{
    const resolved=this.decision(intent);
    if(resolved.type!=="decision")return resolved;
    const plan=new CanonicalActionPlanner(this.registry).planDecision(resolved.decision);
    const step=plan?.steps[0];
    if(!plan||!step)return{type:"unknown",reason:"CANONICAL_PLAN_UNAVAILABLE"};
    return{type:"tool",tool:step.tool,input:step.input,explanation:step.explanation??`Preparando ${resolved.decision.operation}…`,responseMode:plan.responseMode??"deterministic",intent:resolved.intent,deferredAction:plan.deferredAction};
  }

  resolveScope(intent:CanonicalIntent):ScopeResolution{
    const raw=entity(intent,"folder");if(!raw)return{status:"absent"};
    const roots=this.allowedRoots();
    const registry=new LocationRegistry({},[],roots);
    const resolution=new PathIntentResolver(registry).resolve(raw);
    if(resolution.status==="resolved"&&resolution.resolvedPath){
      if(!isAllowedPath(resolution.resolvedPath,roots)){
        this.metrics?.record("intent.scope.unresolved",1,{reason:"NOT_ALLOWED"});
        return{status:"unresolved",raw,reason:"NOT_ALLOWED"};
      }
      return{status:"resolved",path:resolution.resolvedPath,raw};
    }
    const reason=resolution.status==="needs_confirmation"?"AMBIGUOUS_LOCATION":"UNKNOWN_ALIAS";
    this.metrics?.record("intent.scope.unresolved",1,{reason});
    return{status:"unresolved",raw,reason};
  }
  private scopeClarification(intent:AgentIntent,raw:string):MappedHybridDecision{
    return{type:"clarification",intent,question:`Não reconheci a pasta "${raw}" como um local autorizado. Qual pasta autorizada devo usar?`};
  }
}
function entity(intent:CanonicalIntent,key:string){const value=intent.entities[key]?.value;return typeof value==="string"&&value.trim()?value.trim():undefined;}
function isAbsolutePortable(value:string){return path.isAbsolute(value)||path.win32.isAbsolute(value);}
function toAgentIntent(intent:CanonicalIntent):AgentIntent{
  const mutation=new Set(["create","update","delete"]);
  const mappedIntent:intentName=intent.intent==="find"?"search":intent.intent==="open"?"read":intent.intent==="execute"?"read":intent.intent==="unknown"?"read":intent.intent;
  const entities=Object.fromEntries(Object.entries(intent.entities).map(([key,entry])=>[key,entry.value]));
  const domain:AgentIntent["domain"]=intent.domain==="documents"?"document":intent.domain==="unknown"||intent.domain==="chat"||intent.domain==="conversation"||intent.domain==="web"||intent.domain==="macro"?"general":intent.domain;
  return{schemaVersion:1,status:"ready",domain,intent:mappedIntent,operation:intent.operation,entities,referencesPreviousResult:intent.referencesPreviousResult,requiresDataLookup:["find","list","read","update","delete"].includes(intent.intent),requiresConfirmation:mutation.has(intent.intent),confidence:intent.diagnostics?.rawModelConfidence??.9};
}
type intentName=AgentIntent["intent"];
function canonicalDomain(value:string):CanonicalIntentDecision["domain"]{if(value==="documents")return"documents";if(value==="filesystem"||value==="web"||value==="browser"||value==="email"||value==="calendar"||value==="system"||value==="memory")return value;return"system";}
function isAllowedPath(candidate:string,roots:string[]){
  return roots.some(root=>{const windows=path.win32.isAbsolute(candidate)||path.win32.isAbsolute(root);const api=windows?path.win32:path;const normalizedRoot=api.normalize(root),normalizedCandidate=api.normalize(candidate);const relative=api.relative(normalizedRoot,normalizedCandidate);return relative===""||(!relative.startsWith(`..${api.sep}`)&&relative!==".."&&!api.isAbsolute(relative));});
}
