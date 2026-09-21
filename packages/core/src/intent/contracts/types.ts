import type {IntentAction,IntentDomain} from "../types.js";
export type IntentOperationContract={domain:IntentDomain;intent:IntentAction;allowedEntities:readonly string[];requiredEntities:readonly string[];optionalEntities:readonly string[]};
export function contract(domain:IntentDomain,intent:IntentAction,required:readonly string[]=[],optional:readonly string[]=[]):IntentOperationContract{return{domain,intent,requiredEntities:required,optionalEntities:optional,allowedEntities:[...required,...optional]};}
