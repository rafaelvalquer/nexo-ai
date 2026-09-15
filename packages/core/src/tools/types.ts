import type { RiskLevel,ToolResult } from "@nexo/shared";
import { z } from "zod";
export type ToolExecutionContext={runId?:string;taskId?:string;conversationId?:string;agentId?:string;executionId?:string;idempotencyKey?:string;approvalId?:string;/** @internal Set only after ApprovalCoordinator consumes an exact approval. */dispatchAuthorized?:boolean;signal?:AbortSignal};
export type ToolDefinition={
  name:string;
  description:string;
  inputSchema:z.ZodTypeAny;
  risk:RiskLevel;
  permissions:string[];
  pathFields?:string[];
  domain?:string;
  operation?:string;
  mutatesState?:boolean;
  /** Explicit opt-in for a provider that receives an idempotency key. */
  supportsIdempotency?:boolean;
  mutationSafety?: { idempotency: "provider" | "nexo" | "none"; reconciliation: "supported" | "not_supported" };
  agent?: { category?: string; outputTrust: "trusted_local" | "untrusted_external" | "sensitive_local"; hidden?: boolean; polling?: { allowed: true; minIntervalMs: number; maxDurationMs: number; maxAttempts: number; progressFields?: string[] } };
  execute(input:any,context?:ToolExecutionContext):Promise<ToolResult>;
};
