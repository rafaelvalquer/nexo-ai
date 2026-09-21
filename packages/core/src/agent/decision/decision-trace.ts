import type {CommandRoute} from "../../application/command-service.js";
import type {DecisionCandidate,DecisionCandidateSource,DecisionTrace} from "./types.js";
import {stableCandidateId} from "./semantic-action-identity.js";

export function candidateFromCommandRoute(route:CommandRoute,source:DecisionCandidateSource,confidence=.99):DecisionCandidate|undefined{
  if(route.type!=="tool")return undefined;
  const base={
    source,
    domain:domainFromTool(route.tool),
    operation:route.intent?.operation??route.tool,
    entities:{...route.input},
    missing:route.intent?.missing??[],
    ambiguities:[],
    confidence,
    proposedTool:route.tool,
    mutatesState:isMutationRoute(route),
    evidence:[`route:${route.tool}`]
  };
  return{candidateId:stableCandidateId(base as DecisionCandidate),...base};
}
export function createDecisionTrace(input:{requestId:string;conversationId?:string;normalizedInput:string}):DecisionTrace{
  return{...input,domainCandidates:[],intentCandidates:[],rejected:[],contextUsed:[],createdAt:new Date().toISOString()};
}
export function sanitizeDecisionTrace(trace:DecisionTrace,detailed=false):DecisionTrace{
  const sanitize=(candidate:DecisionCandidate):DecisionCandidate=>({...candidate,entities:Object.fromEntries(Object.entries(candidate.entities).map(([key,value])=>[key,redact(key,value,detailed)])),evidence:candidate.evidence.slice(0,detailed?16:8)});
  return{...structuredClone(trace),normalizedInput:redactNormalizedInput(trace.normalizedInput,detailed),domainCandidates:trace.domainCandidates.map(sanitize),intentCandidates:trace.intentCandidates.map(sanitize),selected:trace.selected?sanitize(trace.selected):undefined,rejected:trace.rejected.map(item=>({candidate:sanitize(item.candidate),reason:item.reason})),contextUsed:trace.contextUsed.map(item=>({...item,value:item.field?redact(item.field,item.value,detailed):undefined}))};
}
function redact(key:string,value:unknown,detailed=false){
  if(/token|secret|password|authorization|api.?key/i.test(key))return"[redacted-secret]";
  if(/content|body|payload/i.test(key))return"[redacted-content]";
  if(/recipient|email|to$/i.test(key)&&typeof value==="string")return maskEmail(value);
  if(typeof value==="string"&&!detailed&&value.length>300)return value.slice(0,300)+"…";
  return value;
}
function redactNormalizedInput(value:string,detailed=false){
  let safe=value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,match=>maskEmail(match))
    .replace(/\b(?:authorization\s*[:=]?\s*bearer|bearer)\s+[A-Z0-9._~+\/-]+/gi,"authorization [redacted-secret]")
    .replace(/\b(?:token|api[_ -]?key|secret|password)\s*[:=]\s*\S+/gi,match=>match.replace(/([:=]\s*).+$/,"$1[redacted-secret]"));
  if(/\b(?:arquivo|file)\b/i.test(safe)&&/\.[a-z0-9]{1,12}\b/i.test(safe))safe=safe.replace(/\b(?:e\s+coloque|com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo|e\s+escreva|para\s+conter)\s+([\s\S]+)$/iu,match=>match.slice(0,match.length-(match.match(/\s+([^\s][\s\S]*)$/u)?.[0]?.length??0))+" [redacted-content]");
  return !detailed&&safe.length>1000?safe.slice(0,1000)+"…":safe;
}
function maskEmail(value:string){return value.replace(/(^.).*(@.*$)/,"$1***$2");}
function domainFromTool(tool:string){if(tool.startsWith("email_"))return"email";if(tool.startsWith("calendar_"))return"calendar";if(tool.startsWith("web_"))return"web";if(tool.startsWith("browser_"))return"browser";if(tool.startsWith("document_"))return"documents";if(tool.startsWith("memory_"))return"memory";if(/file|folder/.test(tool))return"filesystem";return"system";}
function isMutationRoute(route:Extract<CommandRoute,{type:"tool"}>){return Boolean(route.intent?.requiresConfirmation)||/^(?:create_|write_|move_|rename_|trash_|delete_|email_(?:send|reply|trash|archive|move|mark)|calendar_(?:create|update|delete|rsvp)|document_create)/.test(route.tool);}
