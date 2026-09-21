import type {ApprovalPlanMetadata} from "../orchestrator/intent-schema.js";
import type {CanonicalActionPlan,CanonicalActionStep} from "./canonical-action-plan.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {ToolAvailability} from "./planning-types.js";

export function planBase(decision:CanonicalIntentDecision,steps:CanonicalActionStep[]=[],extra:Partial<CanonicalActionPlan>={}):CanonicalActionPlan{
  return{
    id:`plan:${decision.candidateId}`,
    domain:decision.domain,
    operation:decision.operation,
    entities:{...decision.entities},
    steps,
    requiresApproval:steps.some(step=>Boolean(step.approval)),
    expectedEffect:decision.operation,
    source:{candidateId:decision.candidateId,decisionSource:decision.source},
    ...extra
  };
}
export function hasTool(tools:ToolAvailability,name:string){return Boolean(tools.get(name));}
export function readStep(tools:ToolAvailability,tool:string,input:Record<string,unknown>,explanation:string):CanonicalActionStep|undefined{
  return hasTool(tools,tool)?{tool,input:cleanUndefined(input),explanation}:undefined;
}
export function writeStep(tools:ToolAvailability,tool:string,input:Record<string,unknown>,explanation:string,approval:ApprovalPlanMetadata):CanonicalActionStep|undefined{
  return hasTool(tools,tool)?{tool,input:cleanUndefined(input),explanation,approval}:undefined;
}
export function unavailable(decision:CanonicalIntentDecision,tool:string){return planBase(decision,[],{direct:`A ferramenta necessária (${tool}) não está disponível com as conexões e permissões atuais.`});}
export function cleanUndefined(input:Record<string,unknown>){return Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined));}
export function stringValue(value:unknown){return typeof value==="string"&&value.trim()?value.trim():undefined;}
export function stringRaw(value:unknown){return typeof value==="string"?value:undefined;}
export function boolValue(value:unknown){return typeof value==="boolean"?value:undefined;}
export function numberValue(value:unknown,fallback:number,min:number,max:number){const parsed=Number(value);return Number.isFinite(parsed)?Math.min(max,Math.max(min,Math.round(parsed))):fallback;}
export function formatDate(value:string){return new Date(value).toLocaleString("pt-BR");}
