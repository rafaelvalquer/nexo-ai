import type {RetrievedIntentExample} from "../intent-memory/retriever.js";
import type {ConversationEntity} from "../resolution/entity-reference-resolver.js";
import type {ConversationActionContextState} from "./conversation-action-context.js";
export type ResolvedContextEntity={kind:string;id:string;label?:string;path?:string;ordinal?:number;turnAge:number;source:"previous_result"|"entity_ledger"|"conversation_history";confidence:number};
export type ContextSnapshot={
  conversationId:string;
  turn:number;
  pendingClarification?:{id:string;field:string;operation:string};
  recentMessages:Array<{role:"user"|"assistant";text:string}>;
  recentEntities:ResolvedContextEntity[];
  lastAction?:{tool:string;operation?:string;resultIds:string[];turnAge:number};
  lastIntent?:{domain:string;operation:string;entities:Record<string,unknown>;turnAge:number};
  memoryCandidates:RetrievedIntentExample[];
};
export function contextSnapshotFromActionState(input:{conversationId:string;turn:number;state?:ConversationActionContextState;previousResultTurnAge?:number;ledger?:ConversationEntity[];memoryCandidates?:RetrievedIntentExample[];recentMessages?:ContextSnapshot["recentMessages"];pendingClarification?:ContextSnapshot["pendingClarification"]}):ContextSnapshot{
  const entities:ResolvedContextEntity[]=[];
  const groups:Array<[string,any[]|undefined]>=input.state?.lastTool==="web_research"
    ?[["page",input.state?.pages],["file",input.state?.files],["email",input.state?.emails],["event",input.state?.events]]
    :input.state?.lastTool?.startsWith("email_")
      ?[["email",input.state?.emails],["file",input.state?.files],["event",input.state?.events],["page",input.state?.pages]]
      :input.state?.lastTool?.startsWith("calendar_")
        ?[["event",input.state?.events],["file",input.state?.files],["email",input.state?.emails],["page",input.state?.pages]]
        :[["file",input.state?.files],["email",input.state?.emails],["event",input.state?.events],["page",input.state?.pages]];
  const previousAge=Math.max(0,input.previousResultTurnAge??0);\n  for(const [kind,rows] of groups)(rows??[]).forEach((row:any,index)=>entities.push({kind,id:String(row.id??row.path??row.url),label:row.name??row.subject??row.title,path:row.path,ordinal:index+1,turnAge:previousAge,source:"previous_result",confidence:1}));
  for(const item of input.ledger??[])if(!entities.some(row=>row.kind===item.kind&&row.id===item.id))entities.push({kind:item.kind,id:item.id,label:item.label,path:item.path,ordinal:item.ordinal,turnAge:Math.max(0,(item as any).turnAge??1),source:"entity_ledger",confidence:.9});
  return{conversationId:input.conversationId,turn:input.turn,pendingClarification:input.pendingClarification,recentMessages:(input.recentMessages??[]).slice(-12),recentEntities:entities,lastAction:input.state?.lastTool?{tool:input.state.lastTool,operation:input.state.lastIntent,resultIds:entities.filter(x=>x.source==="previous_result").map(x=>x.id),turnAge:previousAge}:undefined,lastIntent:input.state?.lastDomain&&input.state.lastIntent?{domain:input.state.lastDomain,operation:input.state.lastIntent,entities:{},turnAge:previousAge}:undefined,memoryCandidates:input.memoryCandidates??[]};
}
