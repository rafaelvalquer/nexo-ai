import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Texture } from "pixi.js";
import { event } from "./fixtures";
import { AGENT_DESKS } from "../../../apps/desktop/renderer/pixel-office/data/agent-desks";
import { OfficeAgent } from "../../../apps/desktop/renderer/pixel-office/agent/OfficeAgent";

vi.mock("../../../apps/desktop/renderer/pixel-office/agent/AgentSprite", async () => {
  const { Container, Rectangle } = await import("pixi.js");
  return { AgentSprite: class extends Container {
    interactionBounds = new Rectangle(-50, -94, 100, 102);
    play = vi.fn(); update = vi.fn();
  } };
});
const agent = (id = "agent-1") => new OfficeAgent(id, Texture.EMPTY, () => {});
function advance(item: OfficeAgent, ms: number, reduced = false) {
  for (let t = 0; t < ms; t += 20) { vi.advanceTimersByTime(20); item.update(.02, reduced); }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());

describe("mesas pessoais e ciclo de trabalho", () => {
  it("traz os quatro polvos de volta às mesas e mantém cada um trabalhando em seu posto", () => {
    const agents = AGENT_DESKS.map(desk => agent(desk.id));
    for (const item of agents) {
      item.position.set(736, 608);
      item.consume(event("tool.started", { agentId: item.id, stationId: "mail-station" }));
      advance(item, 12000);
      expect(item.debug().atDesk).toBe(true);
      expect(item.debug().wander).toBe(false);
      const position = { x: item.x, y: item.y };
      advance(item, 12000);
      expect({ x: item.x, y: item.y }).toEqual(position);
    }
    expect(new Set(agents.map(item => item.desk.color)).size).toBe(4);
    expect(new Set(agents.map(item => `${item.x}:${item.y}`)).size).toBe(4);
  });
  it("interrompe o passeio mesmo quando a categoria continua planejamento", () => {
    const item = agent();
    advance(item, 8500);
    expect(item.debug().distance).toBeGreaterThan(0);
    item.consume(event("run.created", { stationId: "central-desk" }));
    advance(item, 10000);
    expect(item.debug()).toMatchObject({ atDesk: true, wander: false, runId: "run-1" });
  });
  it("mostra o evento mais recente, retém o título e não passeia entre ferramentas", () => {
    const item = agent();
    item.consume(event("run.created", { metadata: { chatTitle: "Relatório semanal" } }));
    for (let i = 0; i < 100; i++) item.consume(event("tool.progress", { eventId: String(i), label: `Página ${i}`, stationId: "document-station" }));
    expect(item.hudSnapshot()).toMatchObject({ status: "Página 99", project: "Relatório semanal" });
    item.consume(event("tool.completed"));
    advance(item, 10000);
    expect(item.debug()).toMatchObject({ atDesk: true, wander: false, runId: "run-1" });
  });
  it("aguarda aprovação e retoma na mesma mesa", () => {
    const item = agent();
    item.consume(event("approval.requested", { stationId: "approval-gate", label: "Aguardando autorização" }));
    advance(item, 15000);
    expect(item.hudSnapshot().status).toBe("Aguardando autorização");
    expect(item.debug().atDesk).toBe(true);
    item.consume(event("approval.resolved"));
    expect(item.activeRunId).toBe("run-1");
  });
  it.each(["run.completed", "run.failed", "run.cancelled"] as const)("volta a passear após %s, sem ressuscitar eventos antigos", type => {
    const item = agent();
    item.consume(event("run.created"));
    item.consume(event(type));
    expect(item.hudSnapshot().active).toBe(true);
    advance(item, 1600);
    expect(item.hudSnapshot().active).toBe(false);
    item.consume(event("tool.progress", { eventId: "late" }));
    expect(item.activeRunId).toBeUndefined();
    advance(item, 10000);
    expect(item.debug().distance).toBeGreaterThan(0);
  });
  it("reduz movimento durante passeio e restaura trabalho diretamente na mesa", () => {
    const item = agent();
    advance(item, 8500);
    item.update(.02, true);
    const position = { x: item.x, y: item.y };
    advance(item, 10000, true);
    expect({ x: item.x, y: item.y }).toEqual(position);
    item.consume(event("tool.progress"), true);
    expect(item.debug().atDesk).toBe(true);
  });
  it("offline pausa movimento sem perder o trabalho; online retoma", () => {
    const item = agent();
    item.position.set(736, 608);
    item.consume(event("tool.started"));
    item.consume(event("agent.offline"));
    advance(item, 5000);
    expect(item.hudSnapshot()).toMatchObject({ offline: true, active: true });
    item.consume(event("agent.online"));
    advance(item, 10000);
    expect(item.debug().atDesk).toBe(true);
  });
});

