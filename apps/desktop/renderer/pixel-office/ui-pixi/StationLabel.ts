import { Container,Graphics,Text } from "../pixi-runtime";
import type { OfficeStationId } from "@nexo/shared";
import { OFFICE_STATIONS } from "../data/office-layout";
export class StationLabel extends Container{
  constructor(readonly stationId:OfficeStationId){
    super();const station=OFFICE_STATIONS[stationId];
    const text=new Text({text:`${station.icon} ${station.name}`,style:{fontFamily:"system-ui, sans-serif",fontSize:12,fontWeight:"700",fill:0xf4f6ff}});
    const panel=new Graphics().roundRect(0,0,Math.ceil(text.width)+18,28,10).fill({color:0x090d1a,alpha:.72}).stroke({color:station.accent,width:1,alpha:.55});
    text.position.set(9,6);this.addChild(panel,text);this.alpha=.78;this.eventMode="none";
  }
}
