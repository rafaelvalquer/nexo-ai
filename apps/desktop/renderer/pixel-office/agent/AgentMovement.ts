export type WorldPoint={x:number;y:number};

export class AgentMovement{
  path:WorldPoint[]=[];
  maxSpeed=220;
  acceleration=620;
  deceleration=760;
  minCruiseSpeed=72;
  velocity=0;
  distanceTravelled=0;

  setPath(path:WorldPoint[]){
    this.path=[...path];
    this.velocity=Math.min(this.velocity,this.minCruiseSpeed);
  }

  clear(){
    this.path=[];
    this.velocity=0;
  }

  update(position:WorldPoint,delta:number){
    const target=this.path[0];
    if(!target)return{arrived:true,direction:"down" as const,speed:0};

    const dx=target.x-position.x,dy=target.y-position.y,distance=Math.hypot(dx,dy);
    const brakingDistance=(this.velocity*this.velocity)/(2*this.deceleration);
    const shouldBrake=distance<Math.max(34,brakingDistance+18);
    const targetSpeed=shouldBrake
      ? Math.max(this.minCruiseSpeed,Math.sqrt(Math.max(0,2*this.deceleration*distance)))
      : this.maxSpeed;

    const rate=targetSpeed>this.velocity?this.acceleration:this.deceleration;
    const difference=targetSpeed-this.velocity;
    const change=Math.sign(difference)*Math.min(Math.abs(difference),rate*delta);
    this.velocity=Math.max(0,this.velocity+change);

    const step=Math.min(distance,Math.max(1,this.velocity*delta));
    if(distance<=step+0.5){
      this.distanceTravelled+=distance;
      position.x=target.x;
      position.y=target.y;
      this.path.shift();
      if(!this.path.length)this.velocity=0;
      return{arrived:this.path.length===0,direction:this.direction(dx,dy),speed:this.velocity};
    }

    position.x+=dx/distance*step;
    position.y+=dy/distance*step;
    this.distanceTravelled+=step;
    return{arrived:false,direction:this.direction(dx,dy),speed:this.velocity};
  }

  private direction(dx:number,dy:number){
    return Math.abs(dx)>Math.abs(dy)
      ? dx>0?"right" as const:"left" as const
      : dy>0?"down" as const:"up" as const;
  }
}
