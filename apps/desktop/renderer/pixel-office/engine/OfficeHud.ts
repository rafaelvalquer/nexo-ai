import { Container,Point } from "pixi.js";
import type { OfficeStationId } from "@nexo/shared";
import { OFFICE_STATIONS } from "../data/office-layout";
import type { OfficeScene } from "./OfficeScene";
import { AgentHudLayer } from "../ui-pixi/AgentHudLayer";
import { StationLabel } from "../ui-pixi/StationLabel";
export class OfficeHud extends Container{
  private agentLayer=new AgentHudLayer(),stationLabels=new Map<OfficeStationId,StationLabel>();
  constructor(){super();this.sortableChildren=true;this.zIndex=100000;this.eventMode="none";this.agentLayer.zIndex=20;this.addChild(this.agentLayer);for(const id of Object.keys(OFFICE_STATIONS) as OfficeStationId[]){const label=new StationLabel(id);label.zIndex=5;this.stationLabels.set(id,label);this.addChild(label);}}
  update(scene:OfficeScene,width:number,height:number,delta:number){this.agentLayer.updateAgents(scene.agents.values(),width,height,delta);const showStations=width>=960;for(const[id,label]of this.stationLabels){label.visible=showStations;if(!showStations)continue;const station=OFFICE_STATIONS[id],point=scene.toGlobal(new Point(station.x,station.y-90));label.position.set(Math.max(8,Math.min(width-label.width-8,point.x-label.width/2)),Math.max(8,Math.min(height-label.height-8,point.y)));}}
}
