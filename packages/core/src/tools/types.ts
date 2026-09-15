import type { RiskLevel,ToolResult } from "@nexo/shared";
import { z } from "zod";
export type ToolExecutionContext={runId?:string;taskId?:string;conversationId?:string;agentId?:string;executionId?:string;idempotencyKey?:string;signal?:AbortSignal};
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
  execute(input:any,context?:ToolExecutionContext):Promise<ToolResult>;
};
