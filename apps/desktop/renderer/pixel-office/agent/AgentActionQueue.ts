import type { AgentVisualEvent,OfficeStationId } from "@nexo/shared";
import { stateForEvent,type AgentAnimationState } from "./AgentStateMachine";

export type AgentAction={
  kind:"move"|"animate";
  stationId:OfficeStationId;
  state:AgentAnimationState;
  label:string;
  minimumMs:number;
  event:AgentVisualEvent;
};

export const STATE_DURATION={success:900,error:1600,cancelled:1100} as const;

function stationFor(event:AgentVisualEvent):OfficeStationId{
  if(event.type==="approval.requested"||event.type==="approval.resolved")return"approval-gate";
  return event.stationId??"central-desk";
}

export class AgentActionQueue{
  private actions:AgentAction[]=[];
  private activeMoveTarget?:OfficeStationId;

  enqueue(event:AgentVisualEvent,current:OfficeStationId){
    const station=stationFor(event),mapped=stateForEvent(event);
    if(station!==current&&station!==this.activeMoveTarget&&!this.hasMoveTo(station)){
      this.actions.push({kind:"move",stationId:station,state:"walking",label:`Indo para ${event.label}`,minimumMs:0,event});
    }

    const state:AgentAnimationState=
      event.type==="tool.started"?"working":
      event.type==="approval.requested"?"approval":
      mapped;
    const minimumMs=
      state in STATE_DURATION?STATE_DURATION[state as keyof typeof STATE_DURATION]:
      state==="working"?520:
      state==="thinking"?420:
      0;
    this.actions.push({kind:"animate",stationId:station,state,label:event.label,minimumMs,event});
  }

  next(){
    const action=this.actions.shift();
    if(action?.kind==="move")this.activeMoveTarget=action.stationId;
    return action;
  }

  completeMove(station:OfficeStationId){
    if(this.activeMoveTarget===station)this.activeMoveTarget=undefined;
  }

  hasMoveTo(station:OfficeStationId){
    return this.actions.some(action=>action.kind==="move"&&action.stationId===station);
  }

  clear(){
    this.actions=[];
    this.activeMoveTarget=undefined;
  }

  size(){return this.actions.length;}

  debug(){
    return{
      activeMoveTarget:this.activeMoveTarget,
      queuedMoveTargets:this.actions.filter(action=>action.kind==="move").map(action=>action.stationId)
    };
  }
}
