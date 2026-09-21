import type {DecisionCandidate} from "../decision/types.js";
import {semanticActionKey} from "../decision/semantic-candidate-deduper.js";
import type {ClarificationOption} from "./clarification-types.js";

export function clarificationOptionsFromCandidates(candidates:DecisionCandidate[]):ClarificationOption[]{
  const seen=new Set<string>(),result:ClarificationOption[]=[];
  for(const candidate of candidates){
    const key=semanticActionKey(candidate);if(seen.has(key))continue;seen.add(key);
    result.push({
      id:`candidate-${result.length+1}`,
      candidateId:key,
      label:candidateLabel(candidate),
      description:candidateDescription(candidate),
      entities:{...candidate.entities},
      action:{domain:candidate.domain,operation:candidate.operation,proposedTool:candidate.proposedTool}
    });
  }
  return result;
}
function candidateLabel(candidate:DecisionCandidate){
  if(candidate.proposedTool==="find_file")return"Procurar arquivo no computador";
  if(candidate.proposedTool==="web_search"||candidate.proposedTool==="web_research")return"Pesquisar na internet";
  if(candidate.proposedTool==="create_text_file")return"Criar arquivo";
  if(candidate.proposedTool==="create_folder")return"Criar pasta";
  if(candidate.proposedTool==="browser_agent_run")return"Interagir no navegador";
  return candidate.operation.replace(/_/g," ");
}
function candidateDescription(candidate:DecisionCandidate){
  if(candidate.domain==="filesystem")return"Usar as pastas autorizadas deste computador";
  if(candidate.domain==="web")return"Buscar informações em fontes públicas online";
  if(candidate.domain==="browser")return"Executar a interação no navegador";
  return undefined;
}
