import { Container,Point } from "pixi.js";
import type { AgentVisualEvent,OfficeStationId } from "@nexo/shared";
import { AgentSprite } from "./AgentSprite";
import { AgentMovement } from "./AgentMovement";
import { AgentActionQueue,type AgentAction,STATE_DURATION } from "./AgentActionQueue";
import { IdleMovementController } from "./IdleMovementController";
import { Grid } from "../navigation/Grid";
import { findPath } from "../navigation/AStar";
import { smoothPath } from "../navigation/PathSmoothing";
import { IDLE_WANDER_POINTS,OFFICE_STATIONS,type WorldPoint } from "../data/office-layout";
import type { OctopusAnimation } from "../data/sprite-manifest";
import { StationSlotManager } from "./StationSlotManager";
import { animationForStation,bubbleVerb } from "./AgentVisualController";

export type AgentHudSnapshot={
  id:string;
  name:string;
  project:string;
  status:string;
  stationId:OfficeStationId;
  stationName:string;
  active:boolean;
  offline:boolean;
  progress?:number;
  severity:"info"|"success"|"warning"|"error";
  elapsedSeconds:number;
};

export class OfficeAgent extends Container{
  readonly id:string;
  readonly sprite:AgentSprite;
  readonly movement=new AgentMovement();
  readonly queue=new AgentActionQueue();
  readonly idle:IdleMovementController;

  station:OfficeStationId="central-desk";
  activeRunId?:string;
  conversationId?:string;
  taskId?:string;
  navigationMs=0;
  navigationFailures=0;

  private current?:AgentAction;
  private currentSince=0;
  private wandering=false;
  private chatTitle="Livre";
  private lastStatus="Livre";
  private runStartedAt=0;
  private progress?:number;
  private severity:AgentHudSnapshot["severity"]="info";
  private offline=false;
  private pendingSlot?:WorldPoint;

  constructor(
    id:string,
    sheet:import("pixi.js").Texture,
    private grid:Grid,
    private slots:StationSlotManager,
    spawn:WorldPoint,
    onClick:(agent:OfficeAgent)=>void
  ){
    super();
    this.id=id;
    this.position.set(spawn.x,spawn.y);
    this.sprite=new AgentSprite(sheet);
    this.addChild(this.sprite);
    this.hitArea=this.sprite.interactionBounds;
    this.eventMode="static";
    this.cursor="pointer";
    this.on("pointertap",()=>onClick(this));
    this.idle=new IdleMovementController(IDLE_WANDER_POINTS);
    this.sprite.play("idle");
    this.slots.reserve("central-desk",id);
  }

  consume(event:AgentVisualEvent,reduced=false){
    if(event.type==="agent.online"||event.type==="agent.offline"){
      this.cancelWander();
      this.offline=event.type==="agent.offline";
      this.sprite.play(this.offline?"offline":"idle");
      this.setStatus(this.offline?"Ollama offline":"Livre","info");
      return;
    }

    if(this.activeRunId!==event.runId)this.runStartedAt=Date.now();
    this.activeRunId=event.runId;
    this.conversationId=event.conversationId??this.conversationId;
    this.taskId=event.taskId??this.taskId;
    const title=event.metadata?.chatTitle;
    if(typeof title==="string"&&title.trim())this.chatTitle=title.trim();
    this.progress=typeof event.progress==="number"?event.progress:undefined;
    this.severity=event.severity??(event.type==="run.failed"?"error":event.type==="run.completed"?"success":"info");
    this.cancelWander();

    if(["run.completed","run.failed","run.cancelled"].includes(event.type))this.queue.clear();
    this.queue.enqueue(event,this.station);
    if(!this.current)this.startNext(reduced);
  }

  update(delta:number,reduced=false){
    if(this.current){
      if(this.current.kind==="move"){
        if(reduced)this.finishAction(true);
        else{
          const result=this.movement.update(this.position,delta);
          this.sprite.play((`walk${result.direction[0].toUpperCase()}${result.direction.slice(1)}`) as OctopusAnimation);
          if(result.arrived)this.finishAction(false);
        }
      }else{
        const transient=this.current.state in STATE_DURATION;
        if(Date.now()-this.currentSince>=this.current.minimumMs&&(transient||this.queue.size()>0))this.finishAction(reduced);
      }
    }else if(this.wandering){
      const result=this.movement.update(this.position,delta);
      this.sprite.play((`walk${result.direction[0].toUpperCase()}${result.direction.slice(1)}`) as OctopusAnimation);
      if(result.arrived){
        this.wandering=false;
        this.sprite.play("idle");
        this.setStatus("Livre","info");
        this.idle.schedule();
      }
    }else if(!this.offline){
      const point=this.idle.next();
      if(point&&this.route(point)){
        this.wandering=true;
        this.setStatus("Passeando","info");
      }else this.sprite.play("idle");
    }

    this.zIndex=this.y;
    this.sprite.update(delta);
  }

  cancelWander(){
    if(!this.wandering)return;
    this.wandering=false;
    this.movement.clear();
    this.idle.cancel();
  }

  hudSnapshot():AgentHudSnapshot{
    const elapsed=this.runStartedAt&&this.activeRunId?Math.max(0,Math.floor((Date.now()-this.runStartedAt)/1000)):0;
    const station=OFFICE_STATIONS[this.station];
    return{
      id:this.id,
      name:`Agente ${this.id.match(/(\d+)$/)?.[1]??this.id}`,
      project:this.chatTitle,
      status:this.lastStatus||bubbleVerb(this.station),
      stationId:this.station,
      stationName:station.name,
      active:Boolean(this.activeRunId||this.current),
      offline:this.offline,
      progress:this.progress,
      severity:this.severity,
      elapsedSeconds:elapsed
    };
  }

  hudAnchor(){
    return this.toGlobal(new Point(0,-142));
  }

  private startNext(reduced:boolean){
    this.current=this.queue.next();
    if(!this.current){
      this.sprite.play(this.offline?"offline":"idle");
      this.setStatus(this.offline?"Ollama offline":"Livre","info");
      this.activeRunId=undefined;
      this.taskId=undefined;
      this.progress=undefined;
      this.slots.release(this.id);
      return;
    }

    this.currentSince=Date.now();
    this.setStatus(this.current.label,this.severity);

    if(this.current.kind==="move"){
      const target=this.slots.reserve(this.current.stationId,this.id);
      this.pendingSlot=target;
      if(!this.route(target)){
        this.navigationFailures++;
        this.slots.release(this.id,this.current.stationId);
        this.pendingSlot=undefined;
        this.current={...this.current,kind:"animate",state:"error",label:"Estação inacessível",minimumMs:1000};
        this.currentSince=Date.now();
        this.setStatus("Estação inacessível","error");
        this.sprite.play("error");
        return;
      }
      if(reduced){
        this.position.set(target.x,target.y);
        this.finishAction(true);
      }
    }else{
      this.sprite.play(animationForStation(this.current.state,this.current.stationId) as OctopusAnimation);
    }
  }

  private route(target:WorldPoint){
    const start=this.grid.toGrid(this.x,this.y),started=performance.now();
    const raw=findPath(this.grid,start,this.grid.toGrid(target.x,target.y));
    this.navigationMs=performance.now()-started;
    if(!raw.length)return false;
    const path=smoothPath(raw).map(point=>this.grid.toWorld(point));
    path.push({x:target.x,y:target.y});
    this.movement.setPath(path);
    return true;
  }

  private finishAction(reduced:boolean){
    if(this.current?.kind==="move"){
      const target=this.pendingSlot??this.slots.reserve(this.current.stationId,this.id);
      if(reduced)this.position.set(target.x,target.y);
      const previous=this.station;
      this.station=this.current.stationId;
      this.slots.moveReservation(this.id,previous,this.station);
      this.queue.completeMove(this.current.stationId);
      this.pendingSlot=undefined;
    }
    this.current=undefined;
    this.startNext(reduced);
  }

  private setStatus(label:string,severity:AgentHudSnapshot["severity"]){
    this.lastStatus=label;
    this.severity=severity;
  }

  debug(){
    const grid=this.grid.toGrid(this.x,this.y);
    return{
      id:this.id,station:this.station,runId:this.activeRunId,conversationId:this.conversationId,
      x:Math.round(this.x),y:Math.round(this.y),gridX:grid.x,gridY:grid.y,
      pathNodes:this.movement.path.length,queue:this.queue.size(),wander:this.wandering,
      navigationMs:this.navigationMs,navigationFailures:this.navigationFailures,
      distance:Math.round(this.movement.distanceTravelled)
    };
  }
}
