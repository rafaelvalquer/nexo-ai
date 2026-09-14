import type { AgentIntent } from "./intent-schema.js";
import { canonicalizeEmailComposeEntities,normalizeBody,normalizeRecipientsFromEntities } from "../../email/compose/normalizer.js";

export function validateIntentRequirements(intent:AgentIntent):AgentIntent{
  if(intent.domain!=="email"||!(intent.intent==="send"||/send|compose/.test(intent.operation)))return intent;
  const source=intent.entities as Record<string,unknown>,to=normalizeRecipientsFromEntities(source),body=normalizeBody(source),entities=canonicalizeEmailComposeEntities(source),missing:string[]=[];
  if(!to.length)missing.push("to");
  if(!body)missing.push("body");
  if(missing.length){
    return{...intent,status:"needs_clarification",entities,missing,question:missing[0]==="to"?"Qual é o endereço de e-mail do destinatário?":"Qual mensagem você quer enviar?"};
  }
  return{...intent,status:"ready",entities:{...entities,to,body},missing:undefined,question:undefined};
}
