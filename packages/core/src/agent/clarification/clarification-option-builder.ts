import path from "node:path";
import type {DecisionCandidate} from "../decision/types.js";
import {semanticActionIdentity} from "../decision/semantic-action-identity.js";
import type {CanonicalIntentDecision} from "../action-planning/canonical-intent-decision.js";
import type {ClarificationOption,StructuredExecutableRoute} from "./clarification-types.js";

export type DecisionClarificationSeed={candidate:DecisionCandidate;decision:CanonicalIntentDecision};

export function clarificationOptionsFromCandidates(candidates:DecisionCandidate[]):ClarificationOption[]{
  return candidates.map(candidate=>candidateOption(candidate)).filter(uniqueByCandidateId);
}

export function clarificationOptionsFromDecisions(items:DecisionClarificationSeed[]):ClarificationOption[]{
  const seen=new Set<string>(),result:ClarificationOption[]=[];
  for(const item of items){
    const identity=semanticActionIdentity(item.candidate);if(seen.has(identity))continue;seen.add(identity);
    result.push(candidateOption(item.candidate,item.decision,result.length));
  }
  return result;
}

export function fileClarificationOptions(
  matches:Array<{name?:string;path:string;size?:number;modifiedAt?:string}>,
  routeFor:(match:{name?:string;path:string;size?:number;modifiedAt?:string})=>StructuredExecutableRoute
):ClarificationOption[]{
  return matches.map((match,index)=>{
    const target=String(match.path);
    return{
      id:`file-${index+1}`,
      label:match.name?.trim()||path.basename(target),
      description:path.dirname(target),
      candidateId:`filesystem:file:${target}`,
      entities:{path:target},
      action:{domain:"filesystem",operation:routeFor(match).tool},
      route:routeFor(match),
      metadata:{path:target,...(typeof match.size==="number"?{size:match.size}:{}),...(typeof match.modifiedAt==="string"?{modifiedAt:match.modifiedAt}:{})}
    };
  });
}

export function candidateLabel(candidate:DecisionCandidate){
  if(candidate.proposedTool==="find_file"||candidate.operation==="find_file")return"Procurar arquivo no computador";
  if(["web_search","web_research","research","search"].includes(candidate.proposedTool??candidate.operation)&&candidate.domain==="web")return"Pesquisar na internet";
  if(candidate.proposedTool==="create_text_file"||candidate.operation==="create_text_file")return"Criar arquivo";
  if(candidate.proposedTool==="create_folder"||candidate.operation==="create_folder")return"Criar pasta";
  if(candidate.proposedTool==="browser_agent_run"||candidate.operation==="interact")return"Interagir no navegador";
  if(candidate.proposedTool==="browser_open"||candidate.operation==="navigate")return"Abrir site no navegador";
  return humanOperation(candidate.operation);
}
export function candidateDescription(candidate:DecisionCandidate){
  if(candidate.domain==="filesystem")return"Usar as pastas autorizadas deste computador";
  if(candidate.domain==="web")return"Buscar informações em fontes públicas online";
  if(candidate.domain==="browser")return"Executar a interação no navegador";
  if(candidate.domain==="email")return"Usar a conta de e-mail conectada";
  if(candidate.domain==="calendar")return"Usar a agenda conectada";
  return undefined;
}

function candidateOption(candidate:DecisionCandidate,decision?:CanonicalIntentDecision,index=0):ClarificationOption{
  return{
    id:`candidate-${index+1}`,
    candidateId:candidate.candidateId,
    label:candidateLabel(candidate),
    description:candidateDescription(candidate),
    entities:{...candidate.entities},
    action:{domain:candidate.domain,operation:candidate.operation,proposedTool:candidate.proposedTool},
    ...(decision?{decision}:{})
  };
}
function uniqueByCandidateId(option:ClarificationOption,index:number,rows:ClarificationOption[]){return rows.findIndex(row=>row.candidateId===option.candidateId)===index;}
function humanOperation(operation:string){
  const names:Record<string,string>={write_text_file:"Alterar o conteúdo do arquivo",create_text_file:"Criar arquivo",create_folder:"Criar pasta",find_file:"Procurar arquivo",search_files:"Pesquisar arquivos",web_research:"Pesquisar informações na web",research:"Pesquisar informações na web",navigate:"Abrir site",browser_open:"Abrir site",email_send:"Enviar e-mail",calendar_create:"Agendar compromisso"};
  return names[operation]??operation.replace(/_/g," ");
}
