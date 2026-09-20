import type {GoalOutcome} from "./types.js";

export type GoalProgressPhase="research"|"summarize"|"save"|"read"|"mutate"|"send"|"schedule"|"interact";
export type GoalProgressStep={observationIndex:number;toolName:string;phase:GoalProgressPhase;status:GoalOutcome["status"];verified:boolean};
export type GoalProgressState={required:GoalProgressPhase[];steps:GoalProgressStep[];completed:GoalProgressPhase[];pending:GoalProgressPhase[];finalStatus:"pending"|"success"|"partial"|"failed"};

export function createGoalProgressState(userRequest:string):GoalProgressState{
 const required=requiredPhases(userRequest);return{required,steps:[],completed:[],pending:[...required],finalStatus:"pending"};
}
export function updateGoalProgress(state:GoalProgressState|undefined,userRequest:string,observationIndex:number,toolName:string,outcome:GoalOutcome):GoalProgressState{
 const base=state??createGoalProgressState(userRequest),phase=phaseForTool(toolName),steps=[...base.steps.filter(item=>item.observationIndex!==observationIndex),{observationIndex,toolName,phase,status:outcome.status,verified:outcome.verified}];
 const completed=[...new Set(steps.filter(item=>item.status==="success").map(item=>item.phase))];
 const pending=base.required.filter(item=>!completed.includes(item));
 const failed=steps.some(item=>item.status==="failed");
 return{required:base.required,steps,completed,pending,finalStatus:failed?"failed":pending.length?"partial":"success"};
}
export function finalProgressOutcome(state:GoalProgressState):GoalOutcome{
 if(state.finalStatus==="success")return{status:"success",verified:true,evidence:state.completed};
 if(state.finalStatus==="failed")return{status:"failed",verified:true,reason:"Uma etapa necessária falhou.",evidence:state.completed};
 if(state.pending.length)return{status:"partial",verified:true,unmetGoals:state.pending.map(phase=>`etapa pendente: ${phase}`),evidence:state.completed};
 return{status:"unknown",verified:false,reason:"GOAL_PROGRESS_UNKNOWN"};
}
function requiredPhases(text:string):GoalProgressPhase[]{
 const value=fold(text),phases:GoalProgressPhase[]=[];
 if(/\b(pesquise|pesquisar|procure|buscar|noticias|manchetes)\b/.test(value))phases.push("research");
 if(/\b(resuma|resumir|resumo|sintetize)\b/.test(value))phases.push("summarize");
 if(/\b(salve|salvar|grave|gravar|crie .*arquivo|exporte)\b/.test(value))phases.push("save");
 if(/\b(envie|enviar|responda|responder).*e-?mail\b/.test(value))phases.push("send");
 if(/\b(agende|agendar|marque|reuniao|compromisso)\b/.test(value))phases.push("schedule");
 if(/\b(altere|edite|mova|renomeie|apague|delete|exclua)\b/.test(value))phases.push("mutate");
 if(/\b(clique|preencha|login)\b/.test(value))phases.push("interact");
 if(!phases.length)phases.push("read");
 return[...new Set(phases)];
}
function phaseForTool(tool:string):GoalProgressPhase{
 if(/^web_(?:research|search)$/.test(tool))return"research";
 if(/summarize/.test(tool))return"summarize";
 if(/^(?:create_text_file|write_text_file|document_create)/.test(tool))return"save";
 if(/^email_(?:send|reply)/.test(tool))return"send";
 if(/^calendar_(?:create|create_meeting)/.test(tool))return"schedule";
 if(/^(?:write_|move_|rename_|trash_|delete_|email_(?:archive|trash|move|mark)|calendar_(?:update|delete|rsvp))/.test(tool))return"mutate";
 if(/^browser_/.test(tool))return"interact";
 return"read";
}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
