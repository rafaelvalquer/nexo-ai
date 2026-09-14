import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from "pixi.js";
import type { AgentVisualEvent, OfficeStationId } from "@nexo/shared";
import { OfficeAgent } from "../agent/OfficeAgent";
import { Grid } from "../navigation/Grid";
import { AGENT_DESKS } from "../data/agent-desks";
import { OFFICE_HEIGHT, OFFICE_WIDTH } from "../data/office-layout";
import { OcclusionLayer } from "../render/OcclusionLayer";
import { WorldLayers } from "../render/WorldLayers";
import { isTerminalEvent } from "../agent/AgentWorkState";

export class OfficeScene extends Container {
  readonly agents = new Map<string, OfficeAgent>();
  private grid = new Grid();
  private debugLayer = new Graphics();
  private layers = new WorldLayers();
  private occlusion: OcclusionLayer;
  private deskLights = new Map<string, Graphics>();
  private developerMode = false;

  constructor(map: Texture, sheet: Texture, onAgent: (agentId: string, conversationId?: string) => void, _onStation: (station: OfficeStationId) => void) {
    super();
    this.sortableChildren = true;
    this.eventMode = "static";
    this.hitArea = new Rectangle(0, 0, OFFICE_WIDTH, OFFICE_HEIGHT);
    const background = new Sprite(map);
    this.addChild(background, this.layers.depth, this.layers.effects, this.debugLayer);
    for (const desk of AGENT_DESKS) {
      const agent = new OfficeAgent(desk.id, sheet, item => onAgent(item.id, item.conversationId));
      agent.zIndex = agent.y;
      this.agents.set(desk.id, agent);
      this.layers.depth.addChild(agent);
      const light = new Graphics().roundRect(-44, -12, 88, 24, 6).fill({ color: 0x0b1020, alpha: .95 }).stroke({ color: desk.color, width: 2 });
      const label = new Text({ text: desk.name.toUpperCase(), style: { fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: "700", fill: desk.color } });
      label.anchor.set(.5);
      light.addChild(label);
      light.position.set(desk.position.x + 146, desk.position.y - 20);
      light.eventMode = "static";
      light.cursor = "pointer";
      light.on("pointertap", () => onAgent(agent.id, agent.conversationId));
      this.layers.effects.addChild(light);
      this.deskLights.set(desk.id, light);
    }
    this.occlusion = new OcclusionLayer(map);
    this.occlusion.mount(this.layers.depth);
    this.debugLayer.zIndex = 5000;
    this.debugLayer.eventMode = "none";
  }

  consume(event: AgentVisualEvent, reduced = false) {
    if (event.type === "agent.online" || event.type === "agent.offline") {
      for (const agent of this.agents.values()) agent.consume({ ...event, agentId: agent.id }, reduced);
      return;
    }
    const agent = this.agents.get(event.agentId) ?? this.agents.get("agent-1")!;
    agent.consume(event, reduced);
  }
  restore(events: AgentVisualEvent[], reduced = false) {
    const latest = new Map<string, AgentVisualEvent>();
    for (const event of events) latest.set(event.runId, event);
    for (const event of latest.values()) if (!isTerminalEvent(event)) this.consume(event, reduced);
  }
  update(delta: number, reduced = false) {
    for (const agent of this.agents.values()) {
      agent.update(delta, reduced);
      this.deskLights.get(agent.id)!.alpha = agent.activeRunId ? 1 : .65;
    }
  }
  activeAgentPoints() {
    return [...this.agents.values()].filter(agent => Boolean(agent.activeRunId)).map(agent => ({ x: agent.x, y: agent.y }));
  }
  setDeveloperMode(value: boolean) { this.developerMode = value; this.redrawDebug(); }
  exportGrid() {
    return JSON.stringify({ cellSize: this.grid.cellSize, width: this.grid.width, height: this.grid.height, blocked: this.grid.blockedCells().map(({ x, y }) => [x, y]) }, null, 2);
  }
  private redrawDebug() {
    this.debugLayer.clear();
    if (!this.developerMode) return;
    for (const cell of this.grid.blockedCells()) this.debugLayer.rect(cell.x * 32, cell.y * 32, 32, 32).fill({ color: 0xff5577, alpha: .12 });
    for (const desk of AGENT_DESKS) this.debugLayer.circle(desk.position.x, desk.position.y, 14).stroke({ color: desk.color, width: 2 });
  }
  getDebug() {
    const agents = [...this.agents.values()].map(agent => agent.debug());
    return { activeAgents: agents.filter(agent => agent.runId).length, queue: 0,
      navigationMs: Math.max(0, ...agents.map(agent => agent.navigationMs)),
      navigationFailures: agents.reduce((sum, agent) => sum + agent.navigationFailures, 0),
      agentDistance: agents.reduce((sum, agent) => sum + agent.distance, 0), agents };
  }
}

