import type { RiskLevel, ToolResult } from "@nexo/shared";
import type { ToolExecutionContext } from "../../tools/types.js";

export type ActionExecutionStatus =
  | "PREPARED" | "WAITING_APPROVAL" | "APPROVED" | "DISPATCHING"
  | "SUCCEEDED" | "FAILED" | "RESULT_UNKNOWN" | "RECONCILED_SUCCESS"
  | "RECONCILING" | "RECONCILED_FAILURE" | "UNRESOLVED" | "CANCELLED";

export type PreparedAction = {
  executionId: string;
  toolName: string;
  input: Record<string, unknown>;
  fingerprint: string;
  idempotencyKey?: string;
  mutatesState: boolean;
  risk: RiskLevel;
  requiresApproval: boolean;
  status: "PREPARED";
};

export type ActionPreflightResult =
  | { ok: true; action: PreparedAction }
  | { ok: false; code: "TOOL_NOT_FOUND" | "TOOL_DISABLED" | "SECURITY_DENIED" | "CAPABILITY_DENIED" | "SCHEMA_INVALID" | "PATH_DENIED" | "ACTION_STALE"; message: string };

export type ActionExecutionContext = ToolExecutionContext & { userRequest?:string;capabilityResolver?: (permission: string) => boolean | Promise<boolean> };

export type ActionExecutionResult = {
  status: ActionExecutionStatus;
  action: PreparedAction;
  result?: ToolResult;
  error?: string;
};
