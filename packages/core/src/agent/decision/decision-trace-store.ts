import type {NexoDatabase} from "../../database/db.js";
import {sanitizeDecisionTrace} from "./decision-trace.js";
import type {DecisionTrace} from "./types.js";
export class DecisionTraceStore{
  constructor(private readonly db:NexoDatabase,private readonly detailed:()=>boolean=()=>false,private readonly maxEntries=500){}
  save(trace:DecisionTrace){
    const safe=sanitizeDecisionTrace(trace,this.detailed());
    this.db.run("INSERT OR REPLACE INTO decision_traces(request_id,conversation_id,payload_json,created_at) VALUES(?,?,?,?)",[safe.requestId,safe.conversationId??null,JSON.stringify(safe),safe.createdAt]);
    this.db.run("DELETE FROM decision_traces WHERE request_id IN (SELECT request_id FROM decision_traces ORDER BY created_at DESC LIMIT -1 OFFSET ?)",[this.maxEntries]);
  }
  get(requestId:string){const row=this.db.get<{payload_json:string}>("SELECT payload_json FROM decision_traces WHERE request_id=?",[requestId]);if(!row)return undefined;try{return JSON.parse(row.payload_json) as DecisionTrace;}catch{return undefined;}}
  latest(limit=50){return this.db.all<{payload_json:string}>("SELECT payload_json FROM decision_traces ORDER BY created_at DESC LIMIT ?",[Math.max(1,Math.min(limit,200))]).flatMap(row=>{try{return[JSON.parse(row.payload_json) as DecisionTrace];}catch{return[];}});}
}
