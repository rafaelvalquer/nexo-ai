import type {DomainEvidenceSnapshot} from "../../intent/domain/domain-evidence-builder.js";
import type {DecisionCandidate} from "./types.js";
export type HardVetoDecision={veto:boolean;reason?:string};
export class HardVetoMatrix{
 evaluate(userText:string,candidate:DecisionCandidate,evidence:DomainEvidenceSnapshot):HardVetoDecision{
  const tool=candidate.proposedTool??candidate.operation,folded=fold(userText);
  if(evidence.strongFilesystem&&!evidence.explicitWeb&&(candidate.domain==="web"||candidate.domain==="browser"))return{veto:true,reason:"FILESYSTEM_EVIDENCE_VETO_WEB"};
  if(evidence.explicitFilenameWithoutWebSignal&&(candidate.domain==="web"||candidate.domain==="browser"))return{veto:true,reason:"EXPLICIT_FILENAME_WITHOUT_WEB_SIGNAL"};
  if(/\b(envie|enviar|responda|responder)\b.*\be-?mail\b/.test(folded)&&candidate.domain==="filesystem")return{veto:true,reason:"EMAIL_GOAL_VETO_FILESYSTEM"};
  if(/\b(agende|agendar|marque|marcar|reuniao|compromisso)\b/.test(folded)&&(candidate.domain==="web"||candidate.domain==="browser"))return{veto:true,reason:"CALENDAR_GOAL_VETO_WEB"};
  if(/\b(clique|preencha|login|entrar na conta)\b/.test(folded)&&tool==="web_research")return{veto:true,reason:"INTERACTION_VETO_BACKGROUND_RESEARCH"};
  if(/\b(noticia|noticias|manchetes|pesquise|procure)\b/.test(folded)&&tool==="browser_open")return{veto:true,reason:"INFORMATION_GOAL_VETO_NAVIGATION"};
  return{veto:false};
 }
}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
