import { Container,Graphics,Rectangle,Sprite,Texture } from "pixi.js";
import { OCTOPUS_SPRITE,type OctopusAnimation } from "../data/sprite-manifest";

export class AgentSprite extends Container{
  readonly visualScale=.49;
  readonly interactionBounds=new Rectangle(-62,-138,124,146);
  readonly navigationFootprint={width:42,height:24};
  private frames=new Map<OctopusAnimation,Texture[]>();
  private sprite=new Sprite();
  private shadow=new Graphics();
  private animation:OctopusAnimation="idle";
  private frame=0;
  private elapsed=0;
  private life=0;

  constructor(sheet:Texture){
    super();
    for(const[name,indexes]of Object.entries(OCTOPUS_SPRITE.animations) as [OctopusAnimation,number[]][]){
      this.frames.set(name,indexes.map(index=>{
        const col=index%4,row=Math.floor(index/4);
        const x=OCTOPUS_SPRITE.frameColumns[col],y=OCTOPUS_SPRITE.frameRows[row];
        const w=OCTOPUS_SPRITE.frameColumns[col+1]-x,h=OCTOPUS_SPRITE.frameRows[row+1]-y;
        return new Texture({source:sheet.source,frame:new Rectangle(x,y,w,h)});
      }));
    }

    this.shadow.ellipse(0,4,42,14).fill({color:0x050814,alpha:.34});
    this.shadow.scale.set(1,.72);
    this.sprite.anchor.set(.5,.82);
    this.sprite.scale.set(this.visualScale);
    this.addChild(this.shadow,this.sprite);
    this.play("idle");
    this.eventMode="none";
  }

  play(animation:OctopusAnimation){
    if(this.animation===animation)return;
    this.animation=animation;
    this.frame=0;
    this.elapsed=0;
    this.apply();
  }

  update(deltaSeconds:number){
    this.life+=deltaSeconds;
    const walking=this.animation.startsWith("walk");
    const fps=walking?10:["success","responding","working","reading","mailing","browsing","system"].includes(this.animation)?8:["thinking","planning","approval"].includes(this.animation)?6:4;
    this.elapsed+=deltaSeconds;

    if(this.elapsed>=1/fps){
      this.elapsed%=1/fps;
      const frames=this.frames.get(this.animation)??[];
      if(frames.length){
        this.frame=(this.frame+1)%frames.length;
        this.apply();
      }
    }

    const bob=walking?Math.sin(this.life*14)*2.3:Math.sin(this.life*3.2)*1.25;
    this.sprite.position.y=bob;
    this.shadow.alpha=walking?.26:.34;
    this.shadow.scale.x=walking?.92+Math.sin(this.life*14)*.04:1;
  }

  private apply(){
    this.sprite.texture=this.frames.get(this.animation)?.[this.frame]??Texture.EMPTY;
  }
}
