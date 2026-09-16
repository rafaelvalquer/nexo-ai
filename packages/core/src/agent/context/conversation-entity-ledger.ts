import type { NexoDatabase } from "../../database/db.js";
import type { AgentObservation } from "../loop/types.js";
import type { ConversationEntity } from "../resolution/entity-reference-resolver.js";

export class ConversationEntityLedger{
  constructor(private readonly db:NexoDatabase,private readonly maxEntries=100){}
  list(conversationId:string,kind?:ConversationEntity["kind"]){const all=this.load(conversationId);return(kind?all.filter(item=>item.kind===kind):all).map((item,index)=>({...item,ordinal:index+1}));}
  record(conversationId:string,observation:AgentObservation){
    const discovered=discover(observation.data);
    if(!discovered.length)return;
    const current=this.load(conversationId);
    for(const item of discovered){const existing=current.find(candidate=>candidate.kind===item.kind&&candidate.id===item.id);if(existing)Object.assign(existing,item);else current.unshift({...item,ordinal:1});}
    this.db.run("INSERT OR REPLACE INTO application_state(key,value) VALUES(?,?)",[`entity-ledger:${conversationId}`,JSON.stringify(current.slice(0,this.maxEntries))]);
  }
  clear(conversationId:string){this.db.run("DELETE FROM application_state WHERE key=?",[`entity-ledger:${conversationId}`]);}
  private load(conversationId:string):ConversationEntity[]{const row=this.db.get<{value:string}>("SELECT value FROM application_state WHERE key=?",[`entity-ledger:${conversationId}`]);if(!row)return[];try{const value=JSON.parse(row.value);return Array.isArray(value)?value:[];}catch{return[];}}
}

function discover(value:unknown):ConversationEntity[]{const output:ConversationEntity[]=[];walk(value,output,new Set());return output;}
function walk(value:unknown,output:ConversationEntity[],seen:Set<unknown>){if(!value||typeof value!=="object"||seen.has(value))return;seen.add(value);if(Array.isArray(value)){for(const item of value)walk(item,output,seen);return;}const row=value as Record<string,unknown>;const id=string(row.id)||string(row.messageId)||string(row.documentId)||string(row.eventId);const path=string(row.path)||string(row.destination);if(id){const kind:ConversationEntity["kind"]=row.messageId||row.subject||row.receivedAt?"email":row.eventId||row.start&&row.end?"event":row.documentId||row.mimeType?"document":"file";output.push({kind,id,label:string(row.subject)||string(row.title)||string(row.name),path,ordinal:1});}else if(path)output.push({kind:"file",id:path,path,label:string(row.name),ordinal:1});for(const nested of Object.values(row))walk(nested,output,seen);}
function string(value:unknown){return typeof value==="string"&&value.trim()?value.trim():undefined;}
