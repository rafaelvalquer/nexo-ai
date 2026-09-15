import type { Container } from "../pixi-runtime";
import { OFFICE_HEIGHT,OFFICE_WIDTH,type WorldPoint } from "../data/office-layout";

export type OfficeZoom="fit"|1|1.25|1.5;

export class OfficeCamera{
  private width=1;
  private height=1;
  private zoom:OfficeZoom="fit";
  private targetScale=1;
  private targetX=0;
  private targetY=0;
  private autoFocus=true;
  private manualUntil=0;
  private fitScale=1;

  resize(stage:Container,width:number,height:number,zoom:OfficeZoom=this.zoom,immediate=false){
    this.width=Math.max(1,width);
    this.height=Math.max(1,height);
    this.zoom=zoom;
    this.fitScale=Math.min(this.width/OFFICE_WIDTH,this.height/OFFICE_HEIGHT);
    if(Date.now()>=this.manualUntil)this.setFitTarget();
    if(immediate)this.applyImmediate(stage);
  }

  setZoom(stage:Container,width:number,height:number,zoom:OfficeZoom){
    this.zoom=zoom;
    this.manualUntil=Date.now()+4500;
    this.resize(stage,width,height,zoom);
    this.setFitTarget();
  }

  setAutoFocus(value:boolean){
    this.autoFocus=value;
    if(!value)this.manualUntil=Date.now()+60_000;
    else this.manualUntil=0;
  }

  focusPoint(point:WorldPoint,zoom=1.4){
    if(!this.autoFocus||Date.now()<this.manualUntil)return;
    const scale=Math.max(this.fitScale,Math.min(this.fitScale*zoom,this.fitScale*1.65));
    this.setCenteredTarget(point.x,point.y,scale);
  }

  frameActive(points:WorldPoint[]){
    if(!this.autoFocus||Date.now()<this.manualUntil)return;
    if(!points.length){this.setFitTarget();return;}
    if(points.length===1){this.focusPoint(points[0],1.42);return;}
    const xs=points.map(point=>point.x);
    const ys=points.map(point=>point.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const paddingX=360,paddingY=300;
    const contentWidth=Math.max(520,maxX-minX+paddingX),contentHeight=Math.max(420,maxY-minY+paddingY);
    const scale=Math.max(this.fitScale,Math.min(this.fitScale*1.4,Math.min(this.width/contentWidth,this.height/contentHeight)));
    this.setCenteredTarget((minX+maxX)/2,(minY+maxY)/2,scale);
  }

  panBy(dx:number,dy:number){
    this.manualUntil=Date.now()+5000;
    this.targetX+=dx;
    this.targetY+=dy;
  }

  manualZoom(factor:number){
    this.manualUntil=Date.now()+5000;
    const oldScale=this.targetScale,min=this.fitScale*.82,max=this.fitScale*2;
    this.targetScale=Math.max(min,Math.min(max,this.targetScale*factor));
    const centerX=this.width/2,centerY=this.height/2;
    const worldCenterX=(centerX-this.targetX)/Math.max(.0001,oldScale),worldCenterY=(centerY-this.targetY)/Math.max(.0001,oldScale);
    this.targetX=centerX-worldCenterX*this.targetScale;
    this.targetY=centerY-worldCenterY*this.targetScale;
  }

  update(stage:Container,delta:number){
    const amount=1-Math.pow(.001,Math.min(.05,delta));
    const scale=stage.scale.x+(this.targetScale-stage.scale.x)*amount;
    const x=stage.position.x+(this.targetX-stage.position.x)*amount;
    const y=stage.position.y+(this.targetY-stage.position.y)*amount;
    stage.scale.set(scale);
    stage.position.set(x,y);
  }

  private setFitTarget(){
    const multiplier=this.zoom==="fit"?1:this.zoom,scale=this.fitScale*multiplier;
    this.targetScale=scale;
    this.targetX=Math.round((this.width-OFFICE_WIDTH*scale)/2);
    this.targetY=Math.round((this.height-OFFICE_HEIGHT*scale)/2);
  }

  private setCenteredTarget(x:number,y:number,scale:number){
    this.targetScale=scale;
    this.targetX=this.width/2-x*scale;
    this.targetY=this.height/2-y*scale;
  }

  private applyImmediate(stage:Container){
    stage.scale.set(this.targetScale);
    stage.position.set(this.targetX,this.targetY);
  }
}
