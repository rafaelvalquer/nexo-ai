import type {DecisionCandidate} from "./types.js";
import {goalContracts} from "./goal-contracts.js";
export type GoalSatisfaction={status:"satisfied"|"partial"|"unsatisfied"|"unknown";score:number;reason?:string;requiredEffect?:string};
export class GoalSatisfactionEvaluator{
 evaluate(userText:string,candidate:DecisionCandidate):GoalSatisfaction{
  const contract=goalContracts[candidate.operation]??goalContracts[candidate.proposedTool??""];
  const info=informationGoal(userText),interaction=interactionGoal(userText),creation=creationGoal(userText),mutation=mutationGoal(userText);
  if(info&&candidate.proposedTool==="browser_open")return{status:"unsatisfied",score:0,reason:"NAVIGATION_DOES_NOT_RETURN_INFORMATION",requiredEffect:"information_returned"};
  if(interaction&&candidate.proposedTool&&!/browser_agent_run|browser_(click|type|download)/.test(candidate.proposedTool))return{status:"unsatisfied",score:.1,reason:"INTERACTION_REQUIRED",requiredEffect:"interaction"};
  if(creation&&contract&&contract.effect!=="resource_created"&&contract.effect!=="message_sent"&&contract.effect!=="event_changed")return{status:"unsatisfied",score:.1,reason:"CREATION_GOAL_NOT_SATISFIED",requiredEffect:"resource_created"};
  if(mutation&&!candidate.mutatesState)return{status:"unsatisfied",score:.1,reason:"MUTATION_GOAL_NOT_SATISFIED"};
  if(candidate.missing.length)return{status:"partial",score:.45,reason:"MISSING_REQUIRED_ENTITY"};
  if(candidate.ambiguities.length)return{status:"partial",score:.6,reason:"AMBIGUOUS_GOAL"};
  if(contract)return{status:"satisfied",score:1,requiredEffect:contract.effect};
  if(candidate.proposedTool)return{status:"unknown",score:.7,reason:"NO_GOAL_CONTRACT"};
  return{status:"unknown",score:.5,reason:"NO_TOOL"};
 }
}
function informationGoal(text:string){return /\b(traga|mostre|diga|informe|resuma|explique|pesquise|procure|not[ií]cias?|dados|resultado)\b/i.test(text);}
function interactionGoal(text:string){return /\b(clique|preencha|faça login|entre na conta|baixe|download|selecione)\b/i.test(text);}
function creationGoal(text:string){return /\b(crie|criar|gere|gerar|envie|enviar|agende|agendar)\b/i.test(text);}
function mutationGoal(text:string){return /\b(crie|criar|edite|editar|altere|alterar|mova|mover|renomeie|renomear|apague|apagar|delete|envie|enviar|responda|responder|agende|agendar)\b/i.test(text);}
