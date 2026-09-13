import { randomUUID } from "node:crypto";
import type { AgentVisualEvent,AgentVisualSnapshot } from "@nexo/shared";
import type { VisualRunRepository } from "./persistence.js";
type Draft=Omit<AgentVisualEvent,"eventId"|"timestamp"|"agentId">&{agentId?:string};
export class VisualEventBus{
  private listeners=new Set<(event:AgentVisualEvent)=>void>();private recent:AgentVisualEvent[]=[];
  constructor(private repository?:VisualRunRepository){if(repository){repository.removeOld();this.recent=repository.listActive();}}
  emit(draft:Draft){const event:AgentVisualEvent={...draft,eventId:randomUUID(),agentId:draft.agentId??"agent-1",timestamp:new Date().toISOString()};this.recent=[...this.recent,event].slice(-100);this.repository?.upsert(event);for(const listener of this.listeners)listener(event);return event;}
  subscribe(listener:(event:AgentVisualEvent)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  snapshot():AgentVisualSnapshot{return{current:this.recent.at(-1),recent:[...this.recent]};}
}
