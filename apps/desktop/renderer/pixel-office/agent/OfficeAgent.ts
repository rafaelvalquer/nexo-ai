import { Container, Point, type Texture } from "pixi.js";
import type { AgentVisualEvent, OfficeStationId } from "@nexo/shared";
import { AgentSprite } from "./AgentSprite";
import { AgentMovement } from "./AgentMovement";
import { IdleMovementController } from "./IdleMovementController";
import { AgentWorkState, isTerminalEvent } from "./AgentWorkState";
import { Grid } from "../navigation/Grid";
import { findPath } from "../navigation/AStar";
import { smoothPath } from "../navigation/PathSmoothing";
import { OFFICE_STATIONS, type WorldPoint } from "../data/office-layout";
import { deskForAgent, WANDER_POINTS } from "../data/agent-desks";
import type { OctopusAnimation } from "../data/sprite-manifest";

export type AgentHudSnapshot = {
  id: string; name: string; project: string; status: string;
  stationId: OfficeStationId; stationName: string; deskName: string; color: number;
  active: boolean; offline: boolean; progress?: number;
  severity: "info" | "success" | "warning" | "error"; elapsedSeconds: number;
};
export class OfficeAgent extends Container {
  readonly sprite: AgentSprite;
  readonly movement = new AgentMovement();
  readonly work = new AgentWorkState();
  readonly idle = new IdleMovementController(WANDER_POINTS);
  readonly desk;
  private grid: Grid;
  private motion: "none" | "desk" | "wander" = "none";
  private navigationError = false;
  private nextRouteAt = 0;
  navigationMs = 0;
  navigationFailures = 0;

  constructor(readonly id: string, sheet: Texture, onClick: (agent: OfficeAgent) => void) {
    super();
    this.desk = deskForAgent(id);
    this.grid = new Grid(id);
    this.position.set(this.desk.position.x, this.desk.position.y);
    this.sprite = new AgentSprite(sheet, this.desk.spriteRow);
    this.addChild(this.sprite);
    this.hitArea = this.sprite.interactionBounds;
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointertap", () => onClick(this));
  }
  get activeRunId() { const event=this.work.event; return event && !isTerminalEvent(event) ? event.runId : undefined; }
  get conversationId() { return this.work.event?.conversationId; }
  get taskId() { return this.work.event?.taskId; }
  get station(): OfficeStationId { return this.work.event?.stationId ?? "central-desk"; }
  private atDesk() { return Math.hypot(this.x - this.desk.position.x, this.y - this.desk.position.y) < 1; }

  consume(event: AgentVisualEvent, reduced = false) {
    if (!this.work.consume(event)) return;
    if (this.work.offline) this.stop();
    else if (this.work.event && !isTerminalEvent(this.work.event)) this.returnToDesk(reduced);
    else if (this.motion === "wander" || (this.work.event && isTerminalEvent(this.work.event))) this.stop();
    this.renderPose(reduced);
  }
  update(delta: number, reduced = false) {
    if (this.work.update()) { this.stop(); this.navigationError = false; this.idle.schedule(); }
    if (reduced && this.motion === "wander") this.stop();
    if (this.work.event && !this.work.offline && !isTerminalEvent(this.work.event)) this.returnToDesk(reduced);
    if (this.motion !== "none" && !this.work.offline) {
      const result = this.movement.update(this.position, Math.min(delta, .05));
      this.sprite.play(`walk${result.direction[0].toUpperCase()}${result.direction.slice(1)}` as OctopusAnimation);
      if (result.arrived) { this.motion = "none"; this.idle.schedule(); this.renderPose(reduced); }
    } else {
      if (!this.work.event && !this.work.offline && !reduced) {
        const point = this.idle.next();
        if (point && this.route(point)) this.motion = "wander";
      }
      this.renderPose(reduced);
    }
    this.zIndex = this.y;
    this.sprite.update(delta, reduced);
  }
  private returnToDesk(reduced: boolean) {
    if (reduced) {
      this.stop();
      this.position.set(this.desk.position.x, this.desk.position.y);
      this.navigationError = false;
      return;
    }
    if (this.atDesk() || this.motion === "desk" || Date.now() < this.nextRouteAt) return;
    this.stop();
    if (this.route(this.desk.position)) { this.motion = "desk"; this.navigationError = false; }
    else { this.navigationError = true; this.navigationFailures++; this.nextRouteAt = Date.now() + 2000; }
  }
  private stop() { this.motion = "none"; this.movement.clear(); this.idle.cancel(); }
  private route(target: WorldPoint) {
    const started = performance.now();
    const raw = findPath(this.grid, this.grid.toGrid(this.x, this.y), this.grid.toGrid(target.x, target.y));
    this.navigationMs = performance.now() - started;
    if (!raw.length) return false;
    this.movement.setPath(smoothPath(raw).map(point => this.grid.toWorld(point)));
    return true;
  }
  private renderPose(reduced: boolean) {
    if (this.motion === "none" || reduced) this.sprite.play(this.work.animation());
  }
  hudSnapshot(): AgentHudSnapshot {
    const event = this.work.event;
    const title = event?.metadata?.chatTitle;
    return {
      id: this.id, name: `Polvo ${this.desk.spriteRow + 1} · ${this.desk.colorName}`,
      project: typeof title === "string" && title.trim() ? title : event ? "Tarefa em andamento" : "Livre",
      status: this.work.offline ? "Ollama offline" : this.navigationError ? "Não foi possível chegar à mesa" :
        this.motion === "desk" ? `Voltando à ${this.desk.name.toLowerCase()} · ${event?.label ?? ""}` :
        event?.label ?? (this.motion === "wander" ? "Passeando" : "Disponível"),
      stationId: this.station, stationName: OFFICE_STATIONS[this.station].name,
      deskName: this.desk.name, color: this.desk.color,
      active: Boolean(event && !isTerminalEvent(event)), offline: this.work.offline,
      progress: typeof event?.progress === "number" && Number.isFinite(event.progress) ? event.progress : undefined,
      severity: this.navigationError ? "error" : event?.severity ?? (event?.type === "run.failed" ? "error" : event?.type === "run.completed" ? "success" : "info"),
      elapsedSeconds: event ? Math.max(0, Math.floor((Date.now() - this.work.startedAt) / 1000)) : 0
    };
  }
  hudAnchor() { return this.toGlobal(new Point(0, -96)); }
  debug() {
    return {
      id: this.id, station: this.station, desk: this.desk.name, color: this.desk.colorName,
      runId: this.activeRunId, conversationId: this.conversationId,
      x: Math.round(this.x), y: Math.round(this.y), atDesk: this.atDesk(),
      pathNodes: this.movement.path.length, queue: 0, wander: this.motion === "wander",
      navigationMs: this.navigationMs, navigationFailures: this.navigationFailures,
      distance: Math.round(this.movement.distanceTravelled), status: this.hudSnapshot().status
    };
  }
}
