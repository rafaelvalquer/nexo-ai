import { ipcMain } from "electron";
import type { NexoCore } from "@nexo/core";
import type { MacroStep, MacroCondition, MacroOutput, MacroPolicy, MacroTrigger, CreateMacroInput, UpdateMacroInput } from "@nexo/shared";

const TRIGGERS = new Set(["schedule","interval","manual","app-start","file.created","file.changed","file.deleted","email.received","calendar.before_event","calendar.event_started","system.threshold"]);
const CONDITION_OPERATORS = new Set(["equals","notEquals","contains","notContains","startsWith","endsWith","greaterThan","lessThan","exists"]);

/** Canonical IPC surface for MacroEngine. Legacy automation channels remain as temporary aliases. */
export function registerMacroIpc(core: NexoCore): void {
  ipcMain.handle("nexo:macro:list",()=>core.macros.list());
  ipcMain.handle("nexo:macro:create",(_,value)=>core.macros.create(validateCreate(core,value)));
  ipcMain.handle("nexo:macro:create-natural",(_,value)=>{const data=requireRecord(value,"Rascunho da macro");return core.macros.createFromNatural({name:requireText(data.name,"Nome",160),when:requireText(data.when,"Horário",200),command:requireText(data.command,"Comando",4000),enabled:data.enabled===undefined?true:requireBoolean(data.enabled,"Status")});});
  ipcMain.handle("nexo:macro:set-enabled",(_,id,enabled)=>core.macros.setEnabled(requireId(id),requireBoolean(enabled,"Status")));
  ipcMain.handle("nexo:macro:remove",(_,id)=>core.macros.remove(requireId(id)));
  ipcMain.handle("nexo:macro:run",(_,id)=>core.macros.runManual(requireId(id)));
  ipcMain.handle("nexo:macro:cancel",(_,id)=>core.macros.cancel(requireId(id)));
  ipcMain.handle("nexo:macro:resume-run",(_,id,mode)=>{const runId=requireId(id);if(mode!=="retry"&&mode!=="continue")throw new Error("Ação de retomada inválida.");return core.macros.resumeFailedRun(runId,mode);});
  ipcMain.handle("nexo:macro:draft-natural",(_,value)=>{const data=requireRecord(value,"Rascunho da macro");return core.draftMacro(requireText(data.description,"Descrição",3000),data.name===undefined?undefined:requireText(data.name,"Nome",160));});
  ipcMain.handle("nexo:macro:get",(_,id)=>core.macros.get(requireId(id)));
  ipcMain.handle("nexo:macro:update",(_,id,value)=>{
    const automationId=requireId(id);
    const current=core.macros.get(automationId);
    if(!current)throw new Error("Macro não encontrada.");
    const merged=validateCreate(core,{...pickEditable(current),...requireRecord(value,"Atualização")});
    return core.macros.update(automationId,merged as UpdateMacroInput);
  });
  ipcMain.handle("nexo:macro:duplicate",(_,id)=>core.macros.duplicate(requireId(id)));
  ipcMain.handle("nexo:macro:test",(_,id)=>core.macros.test(requireId(id)));
  ipcMain.handle("nexo:macro:test-draft",(_,value)=>core.macros.testDraft(validateCreate(core,value)));
  ipcMain.handle("nexo:macro:runs",(_,id,limit)=>core.macros.listRuns(requireId(id),Number.isInteger(limit)?Math.min(Math.max(Number(limit),1),100):50));
  ipcMain.handle("nexo:macro:run-get",(_,id)=>core.macros.getRun(requireId(id)));
  ipcMain.handle("nexo:macro:presets",()=>core.macros.presets());
  ipcMain.handle("nexo:macro:action-catalog",()=>core.macros.actionCatalog());
  ipcMain.handle("nexo:macro:trigger-catalog",()=>core.macros.triggerCatalog());
}

function validateCreate(core:NexoCore,value:unknown):CreateMacroInput {
  const data=requireRecord(value,"Macro");
  const name=requireText(data.name,"Nome",160);
  const description=optionalText(data.description,"Descrição",1200);
  const icon=optionalText(data.icon,"Ícone",80);
  const prompt=optionalText(data.prompt,"Solicitação",4000);
  if(typeof data.enabled!=="boolean")throw new Error("Status da macro inválido.");
  const trigger=validateTrigger(data.trigger);
  const conditions=validateConditions(data.conditions);
  const conditionOperator=data.conditionOperator==="OR"?"OR":"AND";
  const allowedActions=new Set(core.macros.actionCatalog().map(item=>item.id));
  const actions=validateActions(data.actions,allowedActions);
  const output=validateOutput(data.output);
  const policy=validatePolicy(data.policy);
  return {name,description,icon,prompt,enabled:data.enabled,trigger,conditions,conditionOperator,actions,output,policy};
}

function validateTrigger(value:unknown):MacroTrigger {
  const data=requireRecord(value,"Gatilho");
  const type=requireText(data.type,"Tipo de gatilho",80);
  if(!TRIGGERS.has(type))throw new Error("Tipo de gatilho inválido.");
  if(type==="manual"||type==="app-start")return {type};
  if(type==="interval")return {type,minutes:requireInteger(data.minutes,"Intervalo",1,10080)};
  if(type==="schedule"){
    const mode=String(data.mode??"");
    if(!["cron","once","daily","weekdays","weekends","weekly","monthly","specific-days"].includes(mode))throw new Error("Modo de agendamento inválido.");
    const cron=optionalText(data.cron,"Cron",120)||undefined,at=optionalText(data.at,"Data",80)||undefined,time=optionalText(data.time,"Horário",5)||undefined;
    if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error("Horário inválido.");
    if(mode==="once"&&!at)throw new Error("Informe quando a macro deve executar.");
    if(mode!=="cron"&&mode!=="once"&&!time)throw new Error("Informe o horário da macro.");
    if(mode==="cron"&&!cron)throw new Error("Agendamento inválido.");
    const daysOfWeek=Array.isArray(data.daysOfWeek)?data.daysOfWeek.map(item=>requireInteger(item,"Dia da semana",0,6)):undefined;
    const dayOfMonth=data.dayOfMonth===undefined?undefined:requireInteger(data.dayOfMonth,"Dia do mês",1,31);
    return {type,mode:mode as Extract<MacroTrigger,{type:"schedule"}>["mode"],cron,at,time,daysOfWeek,dayOfMonth};
  }
  if(type==="file.created"||type==="file.changed"||type==="file.deleted")return {type,path:requireText(data.path,"Pasta monitorada",2000),debounceMs:data.debounceMs===undefined?1500:requireInteger(data.debounceMs,"Debounce",0,60000)};
  if(type==="email.received"){
    const categories=Array.isArray(data.categories)?data.categories.filter((item):item is "primary"|"promotions"|"social"|"updates"|"forums"=>["primary","promotions","social","updates","forums"].includes(String(item))):undefined;
    return {type,connectionId:requireText(data.connectionId,"Conta de e-mail",200),categories,pollIntervalMinutes:requireInteger(data.pollIntervalMinutes,"Intervalo de consulta",1,1440)};
  }
  if(type==="calendar.before_event")return {type,connectionId:requireText(data.connectionId,"Conta da agenda",200),minutesBefore:requireInteger(data.minutesBefore,"Antecedência",1,10080),pollIntervalMinutes:data.pollIntervalMinutes===undefined?5:requireInteger(data.pollIntervalMinutes,"Intervalo de consulta",1,1440)};
  if(type==="calendar.event_started")return {type,connectionId:requireText(data.connectionId,"Conta da agenda",200),pollIntervalMinutes:data.pollIntervalMinutes===undefined?5:requireInteger(data.pollIntervalMinutes,"Intervalo de consulta",1,1440)};
  const metric=data.metric;
  const operator=data.operator;
  if((metric!=="disk_usage"&&metric!=="memory_usage")||!["gt","gte","lt","lte"].includes(String(operator)))throw new Error("Limite de sistema inválido.");
  return {type:"system.threshold",metric,operator:operator as "gt"|"gte"|"lt"|"lte",threshold:requireNumber(data.threshold,"Limite",0,100),checkIntervalMinutes:requireInteger(data.checkIntervalMinutes,"Intervalo de consulta",1,1440)};
}

function validateConditions(value:unknown):MacroCondition[]{
  if(value===undefined)return[];
  if(!Array.isArray(value)||value.length>50)throw new Error("Condições inválidas.");
  return value.map((item,index)=>{const data=requireRecord(item,`Condição ${index+1}`),operator=String(data.operator??"");if(!CONDITION_OPERATORS.has(operator))throw new Error(`Operador inválido na condição ${index+1}.`);return{id:requireText(data.id,`ID da condição ${index+1}`,100),field:requireText(data.field,`Campo da condição ${index+1}`,200),operator:operator as MacroCondition["operator"],value:safeJsonValue(data.value)};});
}

function validateActions(value:unknown,allowed:Set<string>):MacroStep[]{
  if(!Array.isArray(value)||value.length<1||value.length>20)throw new Error("Adicione entre 1 e 20 ações.");
  return value.map((item,index)=>{const data=requireRecord(item,`Ação ${index+1}`),type=requireText(data.type,`Tipo da ação ${index+1}`,120);if(!allowed.has(type))throw new Error(`Ação não registrada: ${type}`);const condition=data.condition===undefined?undefined:validateConditions([data.condition])[0];return{id:requireText(data.id,`ID da ação ${index+1}`,100),type,config:requireRecord(safeJsonValue(data.config??{}),`Configuração da ação ${index+1}`),continueOnError:data.continueOnError===true,condition};});
}

function validateOutput(value:unknown):MacroOutput {
  if(value===undefined)return{type:"notification"};const data=requireRecord(value,"Saída");if(data.type==="notification"||data.type==="silent")return{type:data.type};if(data.type==="chat"){const mode=data.conversationMode;if(mode!=="automation"&&mode!=="existing")throw new Error("Destino de chat inválido.");return{type:"chat",conversationMode:mode};}throw new Error("Saída da macro inválida.");
}
function validatePolicy(value:unknown):MacroPolicy {
  if(value===undefined)return{maxConcurrentRuns:1,retries:{enabled:true,count:2},onRepeatedFailure:"pause"};const data=requireRecord(value,"Política"),retries=requireRecord(data.retries,"Retry");return{maxConcurrentRuns:1,retries:{enabled:retries.enabled!==false,count:requireInteger(retries.count??2,"Quantidade de retries",0,5)},onRepeatedFailure:data.onRepeatedFailure==="continue"?"continue":"pause"};
}
function pickEditable(value:Record<string,unknown>){return{name:value.name,description:value.description,icon:value.icon,prompt:value.prompt,enabled:value.enabled,trigger:value.trigger,conditions:value.conditions,conditionOperator:value.conditionOperator,actions:value.actions,output:value.output,policy:value.policy};}
function requireId(value:unknown){return requireText(value,"ID da macro",200);}
function requireBoolean(value:unknown,name:string){if(typeof value!=="boolean")throw new Error(`${name} inválido.`);return value;}
function requireRecord(value:unknown,name:string):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`${name} inválida.`);return value as Record<string,unknown>;}
function requireText(value:unknown,name:string,max:number){if(typeof value!=="string"||!value.trim()||value.trim().length>max)throw new Error(`${name} inválido.`);return value.trim();}
function optionalText(value:unknown,name:string,max:number){if(value===undefined||value===null||value==="")return undefined;if(typeof value!=="string"||value.trim().length>max)throw new Error(`${name} inválido.`);return value.trim();}
function requireInteger(value:unknown,name:string,min:number,max:number){const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw new Error(`${name} inválido.`);return number;}
function requireNumber(value:unknown,name:string,min:number,max:number){const number=Number(value);if(!Number.isFinite(number)||number<min||number>max)throw new Error(`${name} inválido.`);return number;}
function safeJsonValue(value:unknown):unknown{let encoded:string;try{encoded=JSON.stringify(value);}catch{throw new Error("Configuração contém valor não serializável.");}if(encoded.length>50000)throw new Error("Configuração da macro excede o limite permitido.");return JSON.parse(encoded) as unknown;}
