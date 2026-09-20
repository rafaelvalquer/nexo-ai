import type {CommandRoute} from "../../application/command-service.js";
import type {DecisionCandidate,DecisionCandidateSource,DecisionTrace} from "./types.js";

export function candidateFromCommandRoute(route:CommandRoute,source:DecisionCandidateSource,confidence=.99):DecisionCandidate|undefined{
  if(route.type!=="tool")return undefined;
  return{
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
}
export function createDecisionTrace(input:{requestId:string;conversationId?:string;normalizedInput:string}):DecisionTrace{
  return{...input,domainCandidates:[],intentCandidates:[],rejected:[],contextUsed:[],createdAt:new Date().toISOString()};
}
export function sanitizeDecisionTrace(trace:DecisionTrace,detailed=false):DecisionTrace{
  if(detailed)return structuredClone(trace);
  const sanitize=(candidate:DecisionCandidate):DecisionCandidate=>({...candidate,entities:Object.fromEntries(Object.entries(candidate.entities).map(([key,value])=>[key,redact(key,value)])),evidence:candidate.evidence.slice(0,8)});
  return{...structuredClone(trace),domainCandidates:trace.domainCandidates.map(sanitize),intentCandidates:trace.intentCandidates.map(sanitize),selected:trace.selected?sanitize(trace.selected):undefined,rejected:trace.rejected.map(item=>({candidate:sanitize(item.candidate),reason:item.reason})),contextUsed:trace.contextUsed.map(item=>({...item,value:item.field?redact(item.field,item.value):undefined}))};
}
function redact(key:string,value:unknown){if(/content|body|token|secret|password|authorization/i.test(key))return"[redacted]";if(/recipient|email|to$/i.test(key)&&typeof value==="string")return value.replace(/(^.).*(@.*$)/,"$1***$2");return value;}
function domainFromTool(tool:string){if(tool.startsWith("email_"))return"email";if(tool.startsWith("calendar_"))return"calendar";if(tool.startsWith("web_"))return"web";if(tool.startsWith("browser_"))return"browser";if(tool.startsWith("document_"))return"documents";if(tool.startsWith("memory_"))return"memory";if(/file|folder/.test(tool))return"filesystem";return"system";}
function isMutationRoute(route:Extract<CommandRoute,{type:"tool"}>){return Boolean(route.intent?.requiresConfirmation)||/^(?:create_|write_|move_|rename_|trash_|delete_|email_(?:send|reply|trash|archive|move|mark)|calendar_(?:create|update|delete|rsvp)|document_create)/.test(route.tool);}
