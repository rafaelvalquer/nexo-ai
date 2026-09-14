import type { PlanStep } from "../planner.js";
import type { ToolResult } from "@nexo/shared";
import type { AgentIntent, DeferredAction } from "../orchestrator/intent-schema.js";

export type AgentRunStatus = "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export type PersistedAgentState = {
  userRequest: string;
  steps: PlanStep[];
  nextStep: number;
  results: ToolResult[];
  iteration: number;
  intent?: AgentIntent;
  deferredAction?: DeferredAction;
  responseMode?: "synthesize" | "deterministic" | "presentation";
};

export type AgentRun = {
  id: string;
  status: AgentRunStatus;
  state: PersistedAgentState;
  finalResponse?: string;
  createdAt: string;
  updatedAt: string;
};
