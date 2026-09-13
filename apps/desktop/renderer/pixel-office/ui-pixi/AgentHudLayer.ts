import { Container } from "pixi.js";
import type { OfficeAgent } from "../agent/OfficeAgent";
import { AgentComicBubble } from "./AgentComicBubble";
import { BubbleLayoutManager } from "./BubbleLayoutManager";
export class AgentHudLayer extends Container{
  private bubbles=new Map<string,AgentComicBubble>(),layoutManager=new BubbleLayoutManager();
  updateAgents(agents:Iterable<OfficeAgent>,width:number,height:number,delta:number){
    const list=[...agents];const anchors=list.map(agent=>{const bubble=this.ensure(agent.id);bubble.updateContent(agent.hudSnapshot());bubble.pulse(delta);const point=agent.hudAnchor();return{id:agent.id,x:point.x,y:point.y,width:bubble.bubbleWidth,height:bubble.bubbleHeight};});
    for(const placement of this.layoutManager.layout(anchors,width,height)){const bubble=this.bubbles.get(placement.id);if(bubble)bubble.position.set(placement.x,placement.y);}
    const ids=new Set(list.map(agent=>agent.id));for(const[id,bubble]of this.bubbles){if(ids.has(id))continue;bubble.destroy({children:true});this.bubbles.delete(id);}
  }
  private ensure(id:string){let bubble=this.bubbles.get(id);if(!bubble){bubble=new AgentComicBubble();this.bubbles.set(id,bubble);this.addChild(bubble);}return bubble;}
}
