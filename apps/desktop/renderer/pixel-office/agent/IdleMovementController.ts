import type { WorldPoint } from "./AgentMovement";
export class IdleMovementController{
  private nextAt=0;private lastIndex=-1;
  constructor(private points:WorldPoint[],private random=Math.random,private now=()=>Date.now()){this.schedule();}
  cancel(){this.schedule();}
  ready(){return this.now()>=this.nextAt;}
  next():WorldPoint|undefined{if(!this.points.length||!this.ready())return;let index=Math.floor(this.random()*this.points.length);if(this.points.length>1&&index===this.lastIndex)index=(index+1)%this.points.length;this.lastIndex=index;this.schedule();return this.points[index];}
  schedule(){this.nextAt=this.now()+3000+Math.floor(this.random()*5000);}
  debug(){return{nextAt:this.nextAt,lastIndex:this.lastIndex};}
}
