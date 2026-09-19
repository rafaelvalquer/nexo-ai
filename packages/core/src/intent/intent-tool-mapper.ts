import path from "node:path";
import type { AgentIntent, DeferredAction } from "../agent/orchestrator/intent-schema.js";
import type { ToolRegistry } from "../tools/registry.js";
import { LocationRegistry } from "../locations/location-registry.js";
import { PathIntentResolver } from "../locations/path-intent-resolver.js";
import type { CanonicalIntent } from "./types.js";
import type { LocalMetricsService } from "../observability/metrics.js";

export type MappedHybridIntent=
  |{type:"tool";tool:string;input:Record<string,unknown>;explanation:string;responseMode:"deterministic"|"presentation"|"synthesize";intent:AgentIntent;deferredAction?:DeferredAction}
  |{type:"clarification";question:string;intent:AgentIntent}
  |{type:"unknown";reason:string};

export type ScopeResolution=
  |{status:"absent"}
  |{status:"resolved";path:string;raw:string}
  |{status:"unresolved";raw:string};

export class IntentToolMapper{
  constructor(private readonly registry:ToolRegistry,private readonly allowedRoots:()=>string[],private readonly metrics?:LocalMetricsService){}

  map(intent:CanonicalIntent):MappedHybridIntent{
    const agentIntent=toAgentIntent(intent);
    if(!this.registry.get(intent.operation))return{type:"unknown",reason:`TOOL_NOT_AVAILABLE:${intent.operation}`};
    switch(intent.operation){
      case"create_folder":{
        const scope=this.resolveScope(intent);const name=entity(intent,"name");
        if(scope.status==="unresolved")return this.scopeClarification(agentIntent,scope.raw);
        const folder=scope.status==="resolved"?scope.path:undefined;
        if(!folder||!name)return{type:"unknown",reason:"UNRESOLVED_CREATE_FOLDER_TARGET"};
        return this.tool("create_folder",{path:joinPortable(folder,name)},`Preparando a criação da pasta ${name}…`,"deterministic",agentIntent);
      }
      case"create_text_file":{
        const scope=this.resolveScope(intent);const name=entity(intent,"name");
        if(scope.status==="unresolved")return this.scopeClarification(agentIntent,scope.raw);
        const folder=scope.status==="resolved"?scope.path:undefined;
        if(!folder||!name)return{type:"unknown",reason:"UNRESOLVED_CREATE_FILE_TARGET"};
        return this.tool("create_text_file",{path:joinPortable(folder,name),content:entity(intent,"content")??""},`Preparando a criação de ${name}…`,"deterministic",agentIntent);
      }
      case"find_file":{
        const name=entity(intent,"name");if(!name)return{type:"unknown",reason:"MISSING_FILE_NAME"};
        const scoped=this.resolveScope(intent);if(scoped.status==="unresolved")return this.scopeClarification(agentIntent,scoped.raw);
        const root=scoped.status==="resolved"?scoped.path:undefined;return this.tool("find_file",{name,matchMode:path.extname(name)?"full_name":"stem",...(root?{root}:{})},`Procurando ${name} nas pastas autorizadas…`,"presentation",agentIntent);
      }
      case"list_files":{
        const scope=this.resolveScope(intent);if(scope.status==="unresolved")return this.scopeClarification(agentIntent,scope.raw);
        const folder=scope.status==="resolved"?scope.path:undefined;if(!folder)return{type:"unknown",reason:"UNRESOLVED_FOLDER"};
        return this.tool("list_files",{path:folder},`Listando itens em ${folder}…`,"presentation",agentIntent);
      }
      case"search_files":{
        const query=entity(intent,"query");if(!query)return{type:"unknown",reason:"MISSING_SEARCH_QUERY"};
        const scoped=this.resolveOptionalFolder(intent);if(scoped.status==="invalid")return{type:"unknown",reason:"UNRESOLVED_FOLDER"};
        const folder=scoped.path;return this.tool("search_files",{query,...(folder?{path:folder}:{})},`Pesquisando ${query}…`,"presentation",agentIntent);
      }
      case"write_text_file":{
        const content=entity(intent,"content");const explicit=entity(intent,"path");
        if(content===undefined)return{type:"unknown",reason:"MISSING_CONTENT"};
        if(explicit&&isAbsolutePortable(explicit))return this.tool("write_text_file",{path:explicit,content},"Preparando a alteração do arquivo…","deterministic",agentIntent);
        const file=entity(intent,"file");if(!file)return{type:"unknown",reason:"MISSING_FILE"};
        const scoped=this.resolveScope(intent);if(scoped.status==="unresolved")return this.scopeClarification(agentIntent,scoped.raw);
        const root=scoped.status==="resolved"?scoped.path:undefined;
        return{...this.tool("find_file",{name:file,matchMode:path.extname(file)?"full_name":"stem",...(root?{root}:{})},`Localizando ${file} antes da alteração…`,"deterministic",agentIntent),deferredAction:{kind:"filesystem.write_text",fileName:file,content,...(root?{root}:{})}};
      }
      case"read_file":{
        const target=entity(intent,"path");if(!target)return{type:"unknown",reason:"MISSING_PATH"};
        if(!isAbsolutePortable(target))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        return this.tool("read_file",{path:target},`Lendo ${path.basename(target)}…`,"synthesize",agentIntent);
      }
      case"file_info":{
        const target=entity(intent,"path");if(!target)return{type:"unknown",reason:"MISSING_PATH"};
        if(!isAbsolutePortable(target))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        return this.tool("file_info",{path:target},`Consultando ${path.basename(target)}…`,"deterministic",agentIntent);
      }
      case"copy_file":{
        const source=entity(intent,"source"),destination=entity(intent,"destination");if(!source||!destination)return{type:"unknown",reason:"MISSING_COPY_PATH"};
        if(!isAbsolutePortable(source)||!isAbsolutePortable(destination))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        return this.tool("copy_file",{source,destination},"Preparando a cópia do arquivo…","deterministic",agentIntent);
      }
      case"move_file":{
        const source=entity(intent,"source"),destination=entity(intent,"destination");if(!source||!destination)return{type:"unknown",reason:"MISSING_MOVE_PATH"};
        if(!isAbsolutePortable(source)||!isAbsolutePortable(destination))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        return this.tool("move_file",{source,destination},"Preparando a movimentação do arquivo…","deterministic",agentIntent);
      }
      case"rename_file":{
        const current=entity(intent,"path"),newName=entity(intent,"newName");if(!current||!newName)return{type:"unknown",reason:"MISSING_RENAME_TARGET"};
        if(!isAbsolutePortable(current))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        return this.tool("rename_file",{path:current,newPath:joinPortable(path.dirname(current),newName)},"Preparando a renomeação do arquivo…","deterministic",agentIntent);
      }
      case"trash_file":{
        const target=entity(intent,"path");if(!target)return{type:"unknown",reason:"MISSING_PATH"};
        if(!isAbsolutePortable(target))return{type:"unknown",reason:"PHYSICAL_PATH_REQUIRED"};
        return this.tool("trash_file",{path:target},"Preparando o envio para a lixeira…","deterministic",agentIntent);
      }
      default:return{type:"unknown",reason:`UNMAPPED_OPERATION:${intent.operation}`};
    }
  }

  private tool(tool:string,input:Record<string,unknown>,explanation:string,responseMode:"deterministic"|"presentation"|"synthesize",intent:AgentIntent):Extract<MappedHybridIntent,{type:"tool"}>{
    return{type:"tool",tool,input,explanation,responseMode,intent};
  }
  resolveScope(intent:CanonicalIntent):ScopeResolution{
    const raw=entity(intent,"folder");if(!raw)return{status:"absent"};
    const registry=new LocationRegistry({},[],this.allowedRoots());
    const resolution=new PathIntentResolver(registry).resolve(raw);
    if(resolution.status==="resolved"&&resolution.resolvedPath)return{status:"resolved",path:resolution.resolvedPath,raw};
    this.metrics?.record("intent.scope.unresolved",1,{raw:raw.slice(0,80)});
    return{status:"unresolved",raw};
  }
  private scopeClarification(intent:AgentIntent,raw:string):MappedHybridIntent{
    return{type:"clarification",intent,question:`Não reconheci a pasta "${raw}" como um local autorizado. Qual pasta autorizada devo usar?`};
  }
}

function entity(intent:CanonicalIntent,key:string){
  const value=intent.entities[key]?.value;
  return typeof value==="string"&&value.trim()?value.trim():undefined;
}
function joinPortable(base:string,relative:string){const segments=relative.split(/[\\/]+/).filter(Boolean);return path.win32.isAbsolute(base)?path.win32.join(base,...segments):path.join(base,...segments);}
function isAbsolutePortable(value:string){return path.isAbsolute(value)||path.win32.isAbsolute(value);}
function toAgentIntent(intent:CanonicalIntent):AgentIntent{
  const mutation=new Set(["create","update","delete"]);
  const mappedIntent:intentName= intent.intent==="find"?"search":intent.intent==="open"?"read":intent.intent==="execute"?"read":intent.intent==="unknown"?"read":intent.intent;
  const entities=Object.fromEntries(Object.entries(intent.entities).map(([key,entry])=>[key,entry.value]));
  return{
    schemaVersion:1,status:"ready",domain:"filesystem",intent:mappedIntent,operation:intent.operation,entities,
    referencesPreviousResult:intent.referencesPreviousResult,requiresDataLookup:["find","list","read","update","delete"].includes(intent.intent),
    requiresConfirmation:mutation.has(intent.intent),confidence:intent.diagnostics?.rawModelConfidence??.9
  };
}
type intentName=AgentIntent["intent"];
