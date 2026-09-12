import type { AgentVisualEvent,OfficeStationId } from "@nexo/shared";import { stateForEvent,type AgentAnimationState } from "../agent/AgentStateMachine";
export type OfficeVisualState={runId?:string;event?:AgentVisualEvent;state:AgentAnimationState;stationId:OfficeStationId;label:string;severity:"info"|"success"|"warning"|"error";eventCount:number};
export const initialOfficeState:OfficeVisualState={state:"idle",stationId:"central-desk",label:"Disponível",severity:"info",eventCount:0};
export function visualEventReducer(state:OfficeVisualState,event:AgentVisualEvent):OfficeVisualState{return{runId:event.runId,event,state:stateForEvent(event),stationId:event.stationId??state.stationId,label:event.label,severity:event.severity??"info",eventCount:state.eventCount+1};}
