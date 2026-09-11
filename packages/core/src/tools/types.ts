import type { RiskLevel, ToolResult } from "@nexo/shared";
import { z } from "zod";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  risk: RiskLevel;
  permissions: string[];
  pathFields?: string[];
  execute(input: any): Promise<ToolResult>;
};
