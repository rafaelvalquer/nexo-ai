import { Container } from "pixi.js";
import type { OfficeScene } from "./OfficeScene";
import { AgentHudLayer } from "../ui-pixi/AgentHudLayer";

export class OfficeHud extends Container {
  private agentLayer = new AgentHudLayer();
  constructor() {
    super();
    this.zIndex = 100000;
    this.eventMode = "none";
    this.addChild(this.agentLayer);
  }
  update(scene: OfficeScene, width: number, height: number, delta: number, reduced = false) {
    this.agentLayer.updateAgents(scene.agents.values(), width, height, delta, reduced);
  }
}

