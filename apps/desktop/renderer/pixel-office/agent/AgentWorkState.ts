import type { AgentVisualEvent } from "@nexo/shared";
import { STATE_DURATION } from "./AgentActionQueue";
import { stateForEvent } from "./AgentStateMachine";
import type { OctopusAnimation } from "../data/sprite-manifest";

export const isTerminalEvent = (event: AgentVisualEvent) =>
  ["run.completed", "run.failed", "run.cancelled"].includes(event.type);

/** Latest real activity, independent of the agent's physical desk or movement. */
export class AgentWorkState {
  event?: AgentVisualEvent;
  offline = false;
  startedAt = 0;
  private expiresAt?: number;
  private lastEventId?: string;
  private finishedRuns = new Set<string>();

  constructor(private now = () => Date.now()) {}

  consume(event: AgentVisualEvent) {
    if (event.eventId === this.lastEventId) return false;
    this.lastEventId = event.eventId;
    if (event.type === "agent.online" || event.type === "agent.offline") {
      this.offline = event.type === "agent.offline";
      return true;
    }
    if (this.finishedRuns.has(event.runId)) return false;
    const previous = this.event;
    if (previous?.runId !== event.runId) {
      this.startedAt = this.now();
    }
    this.event = {
      ...event,
      conversationId: event.conversationId ?? (previous?.runId === event.runId ? previous.conversationId : undefined),
      taskId: event.taskId ?? (previous?.runId === event.runId ? previous.taskId : undefined),
      metadata: previous?.runId === event.runId
        ? { ...previous.metadata, ...event.metadata }
        : event.metadata
    };
    this.expiresAt = undefined;
    if (isTerminalEvent(event)) {
      const state = event.type === "run.completed" ? "success" : event.type === "run.failed" ? "error" : "cancelled";
      this.expiresAt = this.now() + STATE_DURATION[state];
      this.finishedRuns.add(event.runId);
      if (this.finishedRuns.size > 100) this.finishedRuns.delete(this.finishedRuns.values().next().value!);
    }
    return true;
  }

  update() {
    if (this.expiresAt === undefined || this.now() < this.expiresAt) return false;
    this.event = undefined;
    this.expiresAt = undefined;
    this.startedAt = 0;
    return true;
  }

  animation(): OctopusAnimation {
    if (this.offline) return "offline";
    if (!this.event) return "idle";
    if (this.event.type === "approval.requested") return "approval";
    if (this.event.type === "tool.started" || this.event.type === "approval.resolved") return "working";
    const state = stateForEvent(this.event);
    return state === "walking" || state === "wander" ? "working" : state;
  }
}
