import path from "node:path";
import type {ResolvedIntentEntity} from "./provenance.js";
const VERIFIED_SOURCES=new Set(["user","clarification","current_turn","previous_result","entity_ledger"]);
export type EntityValidation={valid:boolean;rejected:string[];entities:Record<string,ResolvedIntentEntity>};
export function validateResolvedEntities(operation:string,entities:Record<string,ResolvedIntentEntity>):EntityValidation{
  const rejected:string[]=[],next={...entities};
  for(const [key,entity] of Object.entries(next)){
    const sourceOk=VERIFIED_SOURCES.has(entity.source)||entity.verified===true;
    if(["connectionId","recipient","to","url"].includes(key)&&!sourceOk){rejected.push(key);delete next[key];continue;}
    if(["path","source","destination"].includes(key)&&typeof entity.value==="string"&&(path.isAbsolute(entity.value)||path.win32.isAbsolute(entity.value))&&!sourceOk){rejected.push(key);delete next[key];continue;}
    if(isDestructive(operation)&&["path","source","target","messageId","eventId","documentId"].includes(key)&&!sourceOk){rejected.push(key);delete next[key];}
  }
  return{valid:rejected.length===0,rejected,entities:next};
}
function isDestructive(operation:string){return /delete|trash|remove|move|rename|send|reply|update|write/i.test(operation);}
