import { Container,Graphics,Rectangle,Sprite,Texture } from "pixi.js";
import type { AgentVisualEvent,OfficeStationId } from "@nexo/shared";
import { OfficeAgent } from "../agent/OfficeAgent";
import { Grid } from "../navigation/Grid";
import { OFFICE_STATIONS,AGENT_SPAWNS } from "../data/office-layout";
import { createStationEffects } from "../effects/StationEffects";
import { OcclusionLayer } from "../render/OcclusionLayer";
import { WorldLayers } from "../render/WorldLayers";
import { StationSlotManager } from "../agent/StationSlotManager";

export class OfficeScene extends Container{
  readonly agents=new Map<string,OfficeAgent>();
  private grid=new Grid();
  private slots=new StationSlotManager();
  private stationEffects=createStationEffects();
  private debugLayer=new Graphics();
  private layers=new WorldLayers();
  private occlusion?:OcclusionLayer;
  private developerMode=false;

  constructor(map:Texture,sheet:Texture,onAgent:(agentId:string,conversationId?:string)=>void,onStation:(station:OfficeStationId)=>void,foreground?:Texture){
    super();
    this.sortableChildren=true;
    this.eventMode="static";
    this.hitArea=new Rectangle(0,0,map.width,map.height);
    this.on("pointertap",event=>{
      if(!this.developerMode||!event.ctrlKey)return;
      const local=this.toLocal(event.global);
      this.grid.toggle(this.grid.toGrid(local.x,local.y));
      this.redrawDebug();
    });
    const background=new Sprite(map);
    background.zIndex=0;
    this.addChild(background,this.layers.depth,this.layers.effects,this.debugLayer);
    for(const station of Object.values(OFFICE_STATIONS)){
      const hit=new Graphics().circle(0,0,38).fill({color:station.accent,alpha:.001});
      hit.position.set(station.x,station.y);
      hit.eventMode="static";
      hit.cursor="pointer";
      hit.on("pointertap",()=>onStation(station.id));
      hit.zIndex=10000;
      this.layers.effects.addChild(hit);
    }
    for(const effect of this.stationEffects.values())this.layers.effects.addChild(effect);
    for(let index=1;index<=4;index++){
      const id=`agent-${index}`;
      const agent=new OfficeAgent(id,sheet,this.grid,this.slots,AGENT_SPAWNS[id],item=>onAgent(item.id,item.conversationId));
      agent.zIndex=agent.y;
      this.agents.set(id,agent);
      this.layers.depth.addChild(agent);
    }
    if(foreground){
      this.occlusion=new OcclusionLayer(foreground);
      this.occlusion.mount(this.layers.depth);
    }
    this.debugLayer.zIndex=5000;
  }

  consume(event:AgentVisualEvent,reduced=false){
    if(event.runId==="agent-health"){
      for(const agent of this.agents.values())agent.consume({...event,agentId:agent.id},reduced);
      return;
    }
    const agent=this.agents.get(event.agentId)??this.agents.get("agent-1")!;
    if(event.stationId){
      const effect=this.stationEffects.get(event.type==="approval.requested"?"approval-gate":event.stationId);
      if(effect)effect.setActive(["tool.started","tool.progress","approval.requested","response.streaming"].includes(event.type));
    }
    if(event.type==="approval.requested")this.stationEffects.get("approval-gate")?.setActive(true);
    if(["tool.completed","run.failed","run.cancelled","run.completed","approval.resolved"].includes(event.type)){
      const station=event.type==="approval.resolved"?"approval-gate":event.stationId;
      if(station){
        const anyOther=[...this.agents.values()].some(item=>item.id!==agent.id&&item.activeRunId&&item.station===station);
        if(!anyOther)this.stationEffects.get(station)?.setActive(false);
      }
    }
    agent.consume(event,reduced);
  }

  restore(events:AgentVisualEvent[],reduced=false){
    const latest=new Map<string,AgentVisualEvent>();
    for(const event of events)latest.set(event.runId,event);
    for(const event of latest.values())if(!["run.completed","run.failed","run.cancelled"].includes(event.type))this.consume(event,reduced);
  }

  update(delta:number,reduced=false){
    for(const effect of this.stationEffects.values())effect.update(delta);
    for(const agent of this.agents.values())agent.update(delta,reduced);
  }

  activeAgentPoints(){
    return[...this.agents.values()].filter(agent=>Boolean(agent.activeRunId)).map(agent=>({x:agent.x,y:agent.y}));
  }

  setDeveloperMode(value:boolean){this.developerMode=value;this.redrawDebug();}

  exportGrid(){
    return JSON.stringify({cellSize:this.grid.cellSize,width:this.grid.width,height:this.grid.height,blocked:this.grid.blockedCells().map(({x,y})=>[x,y])},null,2);
  }

  private redrawDebug(){
    this.debugLayer.clear();
    if(!this.developerMode)return;
    for(let x=0;x<=this.grid.width;x++)this.debugLayer.moveTo(x*this.grid.cellSize,0).lineTo(x*this.grid.cellSize,this.grid.height*this.grid.cellSize).stroke({color:0x70b7ff,alpha:.14,width:1});
    for(let y=0;y<=this.grid.height;y++)this.debugLayer.moveTo(0,y*this.grid.cellSize).lineTo(this.grid.width*this.grid.cellSize,y*this.grid.cellSize).stroke({color:0x70b7ff,alpha:.14,width:1});
    for(const cell of this.grid.blockedCells())this.debugLayer.rect(cell.x*this.grid.cellSize,cell.y*this.grid.cellSize,this.grid.cellSize,this.grid.cellSize).fill({color:0xff5577,alpha:.12});
    for(const station of Object.values(OFFICE_STATIONS))this.debugLayer.circle(station.x,station.y,15).stroke({color:station.accent,width:3});
    for(const agent of this.agents.values())this.debugLayer.rect(agent.x-28,agent.y-26,56,30).stroke({color:0x66ffb3,width:2});
  }

  getDebug(){
    const agents=[...this.agents.values()].map(agent=>agent.debug()),active=agents.filter(agent=>agent.runId).length;
    return{activeAgents:active,queue:agents.reduce((sum,item)=>sum+Number(item.queue),0),navigationMs:Math.max(0,...agents.map(item=>Number(item.navigationMs))),navigationFailures:agents.reduce((sum,item)=>sum+Number(item.navigationFailures),0),agentDistance:agents.reduce((sum,item)=>sum+Number(item.distance),0),slots:this.slots.snapshot(),agents};
  }
}
