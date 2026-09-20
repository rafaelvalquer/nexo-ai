export type WebGoalConflict={accepted:boolean;reason?:"information_goal_present"|"interaction_goal_present"|"research_requires_source_reading"};

export class WebGoalConflictGuard{
  evaluate(text:string,route:{type:string;tool?:string}):WebGoalConflict{
    if(route.type!=="tool")return{accepted:true};
    const information=hasInformationGoal(text),interaction=hasInteractionGoal(text);
    if((route.tool==="browser_open"||route.tool==="browser_launch")&&interaction)return{accepted:false,reason:"interaction_goal_present"};
    if((route.tool==="browser_open"||route.tool==="browser_launch")&&information)return{accepted:false,reason:"information_goal_present"};
    if(route.tool==="web_search"&&requiresResearch(text))return{accepted:false,reason:"research_requires_source_reading"};
    if(route.tool==="browser_agent_run"&&information&&!interaction&&!requiresPersonalSession(text))return{accepted:false,reason:"information_goal_present"};
    return{accepted:true};
  }
}
export function hasInformationGoal(text:string){return /\b(pesquis|procure|busque|consulte|traga|mostre|diga|informe|resum|explique|descubra|not[ií]cias?|manchetes?|novidades|destaques?|principais)\b|\bo que saiu\b|\bultim[ao]s? releases?\b/i.test(text);}
export function hasInteractionGoal(text:string){return /\b(clique|clicar|preencha|preencher|digite|digitar|baixe|baixar|download|selecione|selecionar|adicione|adicionar|envie|enviar)\b|\bfa[cç]a\s+login\b|\blog(?:in|ar)\b/i.test(text);}
export function requiresPersonalSession(text:string){return /\b(minha\s+conta|meu\s+perfil|sess[aã]o\s+salva|autenticad[oa])\b/i.test(text);}
export function requiresResearch(text:string){return hasInformationGoal(text)&&!/\b(?:s[oó]\s+)?(?:links?|resultados?\s+da\s+busca)\b/i.test(text);}
