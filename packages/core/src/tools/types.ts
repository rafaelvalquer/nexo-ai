import type { RiskLevel,ToolResult } from "@nexo/shared";
import { z } from "zod";
export type ToolExecutionContext={runId?:string;taskId?:string;conversationId?:string;agentId?:string;signal?:AbortSignal};
export type ToolDefinition={name:string;description:string;inputSchema:z.ZodTypeAny;risk:RiskLevel;permissions:string[];pathFields?:string[];execute(input:any,context?:ToolExecutionContext):Promise<ToolResult>};
