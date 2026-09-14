import { Container, Graphics } from "pixi.js";
import type { OfficeAgent } from "../agent/OfficeAgent";
import { AgentComicBubble } from "./AgentComicBubble";
import { BubbleLayoutManager } from "./BubbleLayoutManager";

export class AgentHudLayer extends Container {
  private bubbles = new Map<string, AgentComicBubble>();
  private connectors = new Graphics();
  private layoutManager = new BubbleLayoutManager();
  constructor() { super(); this.addChild(this.connectors); }
  updateAgents(agents: Iterable<OfficeAgent>, width: number, height: number, _delta: number, _reduced = false) {
    const list = [...agents];
    const scale = Math.min(1, (width - 32) / 480);
    const anchors = list.map(agent => {
      const bubble = this.ensure(agent.id);
      bubble.updateContent(agent.hudSnapshot());
      bubble.scale.set(scale);
      const point = agent.hudAnchor();
      return { id: agent.id, x: point.x, y: point.y, width: bubble.bubbleWidth * scale, height: bubble.bubbleHeight * scale };
    });
    this.connectors.clear();
    for (const placement of this.layoutManager.layout(anchors, width, height)) {
      const bubble = this.bubbles.get(placement.id)!;
      bubble.position.set(placement.x, placement.y);
      const anchor = anchors.find(item => item.id === placement.id)!;
      const startX = placement.x + anchor.width / 2, startY = placement.y + anchor.height;
      this.connectors.moveTo(startX, startY).lineTo(anchor.x, anchor.y + 3).stroke({ color: list.find(agent => agent.id === placement.id)!.desk.color, width: 1, alpha: .3 });
    }
  }
  private ensure(id: string) {
    let bubble = this.bubbles.get(id);
    if (!bubble) { bubble = new AgentComicBubble(); this.bubbles.set(id, bubble); this.addChild(bubble); }
    return bubble;
  }
}

