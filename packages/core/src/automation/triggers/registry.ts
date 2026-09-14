import type { AutomationV2, ToolResult } from "@nexo/shared";
import { getActiveToolRegistry } from "../../tools/registry.js";
import { AutomationRepository } from "../repository.js";
import type { AutomationTriggerEmitter } from "../scheduler.js";

export class AutomationTriggerRegistry {
  private pollers = new Map<string, ReturnType<typeof setInterval>>();
  private inFlight = new Set<string>();

  constructor(private repository: AutomationRepository, private emit: AutomationTriggerEmitter) {}

  install(automation: AutomationV2): void {
    this.uninstall(automation.id);
    if (!automation.enabled) return;
    const trigger=automation.trigger;
    if(trigger.type==="email.received")this.installPolling(automation,Math.max(1,trigger.pollIntervalMinutes),()=>this.pollEmail(automation));
    else if(trigger.type==="calendar.before_event"||trigger.type==="calendar.event_started")this.installPolling(automation,Math.max(1,trigger.pollIntervalMinutes??5),()=>this.pollCalendar(automation));
    else if(trigger.type==="system.threshold")this.installPolling(automation,Math.max(1,trigger.checkIntervalMinutes),()=>this.pollSystem(automation));
  }

  uninstall(id:string):void{const timer=this.pollers.get(id);if(timer)clearInterval(timer);this.pollers.delete(id);this.inFlight.delete(id);}
  stopAll():void{for(const id of [...this.pollers.keys()])this.uninstall(id);}

  private installPolling(automation:AutomationV2,minutes:number,probe:()=>Promise<void>):void{
    const run=async()=>{if(this.inFlight.has(automation.id))return;this.inFlight.add(automation.id);try{await probe();}catch(error){this.repository.setTriggerState(automation.id,{...this.repository.getTriggerState(automation.id),lastProbeError:error instanceof Error?error.message:String(error),lastProbeAt:new Date().toISOString()});}finally{this.inFlight.delete(automation.id);}};
    void run();const timer=setInterval(()=>void run(),minutes*60_000);timer.unref?.();this.pollers.set(automation.id,timer);
  }

  private async pollEmail(automation:AutomationV2):Promise<void>{
    const trigger=automation.trigger;if(trigger.type!=="email.received"||!trigger.connectionId)return;
    const result=await this.readTool("email_search",{connectionId:trigger.connectionId,categories:trigger.categories,maxResults:50});
    const messages=extractMessages(result);const state=this.repository.getTriggerState(automation.id);const seen=new Set(Array.isArray(state.seenMessageIds)?state.seenMessageIds.filter((id):id is string=>typeof id==="string"):[]);
    if(state.initialized!==true){this.repository.setTriggerState(automation.id,{initialized:true,seenMessageIds:messages.map(message=>message.id).filter(Boolean).slice(0,200),lastProbeAt:new Date().toISOString()});return;}
    const fresh=messages.filter(message=>message.id&&!seen.has(message.id)).sort((a,b)=>Date.parse(a.receivedAt??"")-Date.parse(b.receivedAt??""));
    for(const message of fresh)await this.emit(automation,{source:"email",connectionId:trigger.connectionId,message});
    const ids=[...fresh.map(message=>message.id),...seen].filter(Boolean).slice(0,200);this.repository.setTriggerState(automation.id,{initialized:true,seenMessageIds:ids,lastProbeAt:new Date().toISOString()});
  }

  private async pollCalendar(automation:AutomationV2):Promise<void>{
    const trigger=automation.trigger;if((trigger.type!=="calendar.before_event"&&trigger.type!=="calendar.event_started")||!trigger.connectionId)return;
    const now=new Date();const pollMinutes=Math.max(1,trigger.pollIntervalMinutes??5);const before=trigger.type==="calendar.before_event"?trigger.minutesBefore:0;const start=new Date(now.getTime()-pollMinutes*60_000);const end=new Date(now.getTime()+(before+pollMinutes+5)*60_000);
    const result=await this.readTool("calendar_list",{connectionId:trigger.connectionId,start:start.toISOString(),end:end.toISOString()});const events=extractEvents(result);const state=this.repository.getTriggerState(automation.id);const emitted=new Set(Array.isArray(state.emittedEventKeys)?state.emittedEventKeys.filter((id):id is string=>typeof id==="string"):[]);
    for(const event of events){if(!event.id||!event.start)continue;const startAt=Date.parse(event.start);if(Number.isNaN(startAt))continue;const minutesUntil=(startAt-now.getTime())/60_000;const matches=trigger.type==="calendar.before_event"?minutesUntil<=trigger.minutesBefore&&minutesUntil>trigger.minutesBefore-pollMinutes-0.5:minutesUntil<=0&&minutesUntil>-pollMinutes-0.5;const key=`${event.id}:${trigger.type}:${trigger.type==="calendar.before_event"?trigger.minutesBefore:0}`;if(matches&&!emitted.has(key)){emitted.add(key);await this.emit(automation,{source:"calendar",connectionId:trigger.connectionId,event});}}
    this.repository.setTriggerState(automation.id,{emittedEventKeys:[...emitted].slice(-500),lastProbeAt:new Date().toISOString()});
  }

  private async pollSystem(automation:AutomationV2):Promise<void>{
    const trigger=automation.trigger;if(trigger.type!=="system.threshold")return;let value:number;
    if(trigger.metric==="disk_usage"){const result=await this.readTool("disk_usage",{});const rows=Array.isArray(result.data)?result.data as Array<Record<string,unknown>>:[];value=Math.max(0,...rows.map(row=>Number(row.use??0)).filter(Number.isFinite));}
    else{const result=await this.readTool("memory_usage",{});const data=result.data&&typeof result.data==="object"?result.data as Record<string,unknown>:{};const total=Number(data.totalGB??0),used=Number(data.usedGB??0);value=total>0?(used/total)*100:0;}
    const matches=compare(value,trigger.operator,trigger.threshold);const state=this.repository.getTriggerState(automation.id);const wasActive=state.thresholdActive===true;if(matches&&!wasActive)await this.emit(automation,{source:"system",metric:trigger.metric,value,threshold:trigger.threshold});this.repository.setTriggerState(automation.id,{thresholdActive:matches,lastValue:value,lastProbeAt:new Date().toISOString()});
  }

  private async readTool(name:string,input:Record<string,unknown>):Promise<ToolResult>{const registry=getActiveToolRegistry();const tool=registry?.get(name);if(!tool)throw new Error(`Ferramenta de leitura indisponível para automação: ${name}`);if(tool.risk!=="READ"||(tool.mutatesState??false))throw new Error(`Trigger tentou usar ferramenta mutável: ${name}`);const parsed=tool.inputSchema.parse(input);return tool.execute(parsed);}
}

type EmailProbe={id:string;receivedAt?:string;[key:string]:unknown};
type CalendarProbe={id:string;start?:string;[key:string]:unknown};
function extractMessages(result:ToolResult):EmailProbe[]{if(!result.data||typeof result.data!=="object")return[];const messages=(result.data as Record<string,unknown>).messages;return Array.isArray(messages)?messages.filter((item):item is EmailProbe=>Boolean(item)&&typeof item==="object"&&typeof(item as Record<string,unknown>).id==="string"):[];}
function extractEvents(result:ToolResult):CalendarProbe[]{return Array.isArray(result.data)?result.data.filter((item):item is CalendarProbe=>Boolean(item)&&typeof item==="object"&&typeof(item as Record<string,unknown>).id==="string"):[];}
function compare(value:number,operator:"gt"|"gte"|"lt"|"lte",threshold:number):boolean{return operator==="gt"?value>threshold:operator==="gte"?value>=threshold:operator==="lt"?value<threshold:value<=threshold;}
