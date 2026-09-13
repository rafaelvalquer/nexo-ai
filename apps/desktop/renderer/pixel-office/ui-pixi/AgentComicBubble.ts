import { Container,Graphics,Text } from "pixi.js";
import { OFFICE_STATIONS } from "../data/office-layout";
import type { AgentHudSnapshot } from "../agent/OfficeAgent";
const WIDTH=292,ACTIVE_HEIGHT=112,IDLE_HEIGHT=72;
const clip=(value:string,max:number)=>{const clean=value.replace(/\s+/g," ").trim();return clean.length>max?`${clean.slice(0,max-1)}…`:clean;};
const elapsed=(seconds:number)=>`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
export class AgentComicBubble extends Container{
  private panel=new Graphics(),tail=new Graphics(),progressTrack=new Graphics(),progressFill=new Graphics();
  private title=new Text({text:"",style:{fontFamily:"system-ui, sans-serif",fontSize:15,fontWeight:"700",fill:0xffffff}});
  private subtitle=new Text({text:"",style:{fontFamily:"system-ui, sans-serif",fontSize:12,fill:0xaeb9d4}});
  private body=new Text({text:"",style:{fontFamily:"system-ui, sans-serif",fontSize:16,fontWeight:"600",fill:0xf5f7ff,wordWrap:true,wordWrapWidth:260,lineHeight:20}});
  private meta=new Text({text:"",style:{fontFamily:"ui-monospace, monospace",fontSize:11,fill:0x9ba8c6}});
  private currentHeight=ACTIVE_HEIGHT,lastActive=true;
  constructor(){super();this.zIndex=100;this.eventMode="none";this.title.position.set(16,12);this.subtitle.position.set(16,34);this.body.position.set(16,55);this.meta.anchor.set(1,0);this.meta.position.set(WIDTH-14,13);this.addChild(this.tail,this.panel,this.progressTrack,this.progressFill,this.title,this.subtitle,this.body,this.meta);}
  get bubbleWidth(){return WIDTH;}get bubbleHeight(){return this.currentHeight;}
  updateContent(snapshot:AgentHudSnapshot){
    const station=OFFICE_STATIONS[snapshot.stationId],active=snapshot.active||snapshot.offline;this.currentHeight=active?ACTIVE_HEIGHT:IDLE_HEIGHT;this.lastActive=active;
    const severityColor=snapshot.severity==="error"?0xff6e7c:snapshot.severity==="warning"?0xffc857:station.accent;
    this.panel.clear().roundRect(0,0,WIDTH,this.currentHeight,16).fill({color:0x0d1224,alpha:active?.96:.88}).stroke({color:severityColor,width:2,alpha:active?.96:.58});
    this.tail.clear().moveTo(WIDTH/2-11,this.currentHeight-1).lineTo(WIDTH/2+11,this.currentHeight-1).lineTo(WIDTH/2,this.currentHeight+14).closePath().fill({color:0x0d1224,alpha:active?.96:.88}).stroke({color:severityColor,width:2,alpha:active?.96:.58});
    this.title.text=`🐙 ${snapshot.name} · ${station.name}`;this.subtitle.text=clip(snapshot.project==="Livre"?station.activity:snapshot.project,36);this.body.text=clip(snapshot.offline?"Ollama offline":snapshot.status,70);this.body.visible=active;this.meta.text=snapshot.active?elapsed(snapshot.elapsedSeconds):snapshot.offline?"OFF":"LIVRE";
    this.progressTrack.clear();this.progressFill.clear();
    if(active&&typeof snapshot.progress==="number"){const normalized=Math.max(0,Math.min(1,snapshot.progress>1?snapshot.progress/100:snapshot.progress)),y=this.currentHeight-12;this.progressTrack.roundRect(16,y,WIDTH-32,5,3).fill({color:0x26304a,alpha:.95});this.progressFill.roundRect(16,y,(WIDTH-32)*normalized,5,3).fill({color:station.accent,alpha:.95});}
    this.progressTrack.visible=this.progressFill.visible=active&&typeof snapshot.progress==="number";this.alpha=active?1:.8;
  }
  pulse(delta:number){if(!this.lastActive)return;this.scale.set(1+Math.sin(performance.now()/520)*.006);this.alpha=Math.min(1,this.alpha+delta*3);}
}
