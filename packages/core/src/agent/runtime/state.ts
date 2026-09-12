import type { PlanStep } from "../planner.js";
import type { ToolResult } from "@nexo/shared";

export type AgentRunStatus = "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export type PersistedAgentState = {
  userRequest: string;
  steps: PlanStep[];
  nextStep: number;
  results: ToolResult[];
  iteration: number;
};

export type AgentRun = {
  id: string;
  status: AgentRunStatus;
  state: PersistedAgentState;
  finalResponse?: string;
  createdAt: string;
  updatedAt: string;
};
