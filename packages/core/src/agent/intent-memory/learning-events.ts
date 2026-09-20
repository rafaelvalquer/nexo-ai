import {randomUUID} from "node:crypto";
import type {NexoDatabase} from "../../database/db.js";
import type {IntentExampleSource} from "./store.js";
export type LearningFailureType="wrong_operation"|"wrong_entity"|"stale_context"|"wrong_tool"|"unnecessary_clarification"|"goal_not_satisfied";
export type IntentLearningEvent={
 id:string;utterancePattern:string;domain:string;operation:string;entitiesSignature:string;source:IntentExampleSource|"negative";outcome:"success"|"partial"|"failed";confidence:number;resolverVersion:string;modelId?:string;successCount:number;failureCount:number;createdAt:string;lastVerifiedAt?:string;failureType?:LearningFailureType;
};
export class IntentLearningEventStore{
 constructor(private readonly db:NexoDatabase){}
 record(input:Omit<IntentLearningEvent,"id"|"successCount"|"failureCount"|"createdAt"|"lastVerifiedAt">){
  const existing=this.db.get<any>("SELECT * FROM intent_learning_events WHERE utterance_pattern=? AND domain=? AND operation=? AND source=? ORDER BY created_at DESC LIMIT 1",[input.utterancePattern,input.domain,input.operation,input.source]);
  const now=new Date().toISOString(),success=input.outcome==="success"?1:0,failure=input.outcome==="failed"||input.outcome==="partial"?1:0;
  if(existing){
   this.db.run("UPDATE intent_learning_events SET entities_signature=?,outcome=?,confidence=?,resolver_version=?,model_id=?,success_count=success_count+?,failure_count=failure_count+?,last_verified_at=?,failure_type=? WHERE id=?",[input.entitiesSignature,input.outcome,input.confidence,input.resolverVersion,input.modelId??null,success,failure,now,input.failureType??null,existing.id]);
   return this.get(existing.id)!;
  }
  const id=randomUUID();this.db.run("INSERT INTO intent_learning_events(id,utterance_pattern,domain,operation,entities_signature,source,outcome,confidence,resolver_version,model_id,success_count,failure_count,created_at,last_verified_at,failure_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,input.utterancePattern,input.domain,input.operation,input.entitiesSignature,input.source,input.outcome,input.confidence,input.resolverVersion,input.modelId??null,success,failure,now,now,input.failureType??null]);return this.get(id)!;
 }
 get(id:string){const row=this.db.get<any>("SELECT * FROM intent_learning_events WHERE id=?",[id]);return row?map(row):undefined;}
 list(limit=200){return this.db.all<any>("SELECT * FROM intent_learning_events ORDER BY created_at DESC LIMIT ?",[limit]).map(map);}
}
function map(row:any):IntentLearningEvent{return{id:String(row.id),utterancePattern:String(row.utterance_pattern),domain:String(row.domain),operation:String(row.operation),entitiesSignature:String(row.entities_signature),source:row.source,outcome:row.outcome,confidence:Number(row.confidence),resolverVersion:String(row.resolver_version),modelId:row.model_id?String(row.model_id):undefined,successCount:Number(row.success_count??0),failureCount:Number(row.failure_count??0),createdAt:String(row.created_at),lastVerifiedAt:row.last_verified_at?String(row.last_verified_at):undefined,failureType:row.failure_type??undefined};}
