import { Container,Graphics,Text } from "pixi.js";
import type { OfficeStationId } from "@nexo/shared";
import { OFFICE_STATIONS } from "../data/office-layout";

export class DeskActivityEffect extends Container{
  private ring=new Graphics();
  private core=new Graphics();
  private icon:Text;
  private phase=0;

  constructor(readonly stationId:OfficeStationId){
    super();
    const station=OFFICE_STATIONS[stationId];
    this.position.set(station.x,station.y-58);
    this.zIndex=station.y+3;
    this.ring.circle(0,0,24).stroke({color:station.accent,width:3,alpha:.78});
    this.core.circle(0,0,15).fill({color:station.accent,alpha:.1});
    this.icon=new Text({text:station.icon,style:{fontSize:22,fill:station.accent,fontWeight:"700"}});
    this.icon.anchor.set(.5);
    this.addChild(this.core,this.ring,this.icon);
    this.visible=false;
    this.eventMode="none";
  }

  setActive(active:boolean){
    this.visible=active;
    if(!active)this.phase=0;
  }

  update(delta:number){
    if(!this.visible)return;
    this.phase+=delta;
    const wave=(Math.sin(this.phase*4.4)+1)/2;
    this.ring.scale.set(.9+wave*.18);
    this.ring.alpha=.54+wave*.4;
    this.core.scale.set(.9+wave*.28);
    this.core.alpha=.55+wave*.35;
    this.icon.position.y=Math.sin(this.phase*5.2)*2;
  }
}

export function createDeskActivityEffects(){
  return new Map<OfficeStationId,DeskActivityEffect>(
    (Object.keys(OFFICE_STATIONS) as OfficeStationId[]).map(id=>[id,new DeskActivityEffect(id)])
  );
}
