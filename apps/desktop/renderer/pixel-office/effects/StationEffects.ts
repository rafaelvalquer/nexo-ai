import{Container,Graphics,Text}from"pixi.js";import type{OfficeStationId}from"@nexo/shared";import{OFFICE_STATIONS}from"../data/office-layout";
class PulseEffect extends Container{private ring=new Graphics();private phase=0;constructor(stationId:OfficeStationId,symbol:string,color:number){super();const station=OFFICE_STATIONS[stationId];this.position.set(station.x,station.y-52);this.ring.circle(0,0,22).stroke({color,width:3,alpha:.8});const label=new Text({text:symbol,style:{fontSize:24,fill:color}});label.anchor.set(.5);this.addChild(this.ring,label);this.visible=false;this.zIndex=3000;}update(delta:number){if(!this.visible)return;this.phase+=delta;this.ring.scale.set(.85+Math.sin(this.phase*4)*.12);this.alpha=.72+Math.sin(this.phase*5)*.25;}}
export class MailEffect extends PulseEffect{constructor(){super("mail-station","✉",0x65d5ff)}}
export class DocumentEffect extends PulseEffect{constructor(){super("document-station","▤",0xbca7ff)}}
export class BrowserEffect extends PulseEffect{constructor(){super("browser-station","◎",0x5be1ff)}}
export class SystemEffect extends PulseEffect{constructor(){super("system-station","▂▅▇",0x68e6a7)}}
export class CalendarEffect extends PulseEffect{constructor(){super("calendar-station","▣",0xffd166)}}
export class ApprovalEffect extends PulseEffect{constructor(){super("approval-gate","!",0xffc857)}}
export function createStationEffects(){return new Map<OfficeStationId,PulseEffect>([["mail-station",new MailEffect()],["document-station",new DocumentEffect()],["browser-station",new BrowserEffect()],["system-station",new SystemEffect()],["calendar-station",new CalendarEffect()],["approval-gate",new ApprovalEffect()]]);}
