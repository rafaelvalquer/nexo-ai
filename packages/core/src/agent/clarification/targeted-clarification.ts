import type {DecisionCandidate} from "../decision/types.js";
export function targetedClarification(candidate:DecisionCandidate,reason?:string){
 const missing=candidate.missing[0];
 if(missing==="folder")return"Em qual pasta devo executar essa ação?";
 if(missing==="name"||missing==="file")return"Qual é o nome do arquivo ou pasta?";
 if(missing==="destination")return"Para qual destino devo mover ou copiar o item?";
 if(missing==="to"||missing==="recipient")return"Para qual destinatário devo enviar a mensagem?";
 if(missing==="messageId")return"Qual mensagem você quer usar?";
 if(missing==="eventId")return"Qual compromisso você quer usar?";
 const ambiguity=candidate.ambiguities[0];if(ambiguity)return ambiguity;
 if(reason==="WEAK_CONTEXT_FOR_MUTATION")return"Encontrei uma referência no contexto, mas ela não é confiável o bastante para alterar dados. Qual item exato você quer usar?";
 if(reason==="MUTATION_CONFIDENCE_BELOW_THRESHOLD")return"Antes de executar a alteração, confirme o item e o destino exatos.";
 return"Qual informação específica falta para eu concluir essa ação?";
}
