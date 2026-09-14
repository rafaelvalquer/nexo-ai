import { randomUUID } from "node:crypto";
import type { ToolResult } from "@nexo/shared";
import { PresentationRegistry } from "./registry.js";
import type { PresentationRecord } from "./types.js";
import { emailAdapter } from "./adapters/email.js";
import { filesystemAdapter } from "./adapters/filesystem.js";
import { calendarAdapter } from "./adapters/calendar.js";
import { emailStatsAdapter } from "./adapters/system.js";
import { safeArraySummaryAdapter } from "./adapters/generic.js";
import { clarificationAdapter } from "./adapters/clarification.js";
import { emailComposeReviewAdapter } from "./adapters/email-compose.js";

export function defaultPresentationRegistry() {
  return new PresentationRegistry()
    .register(["email_search", "email_get", "email_get_many", "email_get_thread", "email_latest"], emailAdapter)
    .register(["list_files", "search_files", "largest_files"], filesystemAdapter)
    .register(["calendar_list", "calendar_search", "calendar_get"], calendarAdapter)
    .register(["email_stats"], emailStatsAdapter)
    .register(["__clarification__"], clarificationAdapter)
    .register(["__email_compose_review__"], emailComposeReviewAdapter)
    .registerFallback(safeArraySummaryAdapter);
}
export class ChatPresentationBuilder {
  constructor(private registry = defaultPresentationRegistry()) {}
  fromToolResult(toolName: string, result: ToolResult, input: Record<string, unknown> = {}): PresentationRecord {
    const adapter=this.registry.get(toolName)??this.registry.getFallback();
    const projected = result.ok ? adapter?.(result, { toolName, input }) : undefined;
    if (projected) return projected;
    return { presentation: { version: 1, blocks: [{ id: randomUUID(), version: 1, type: "text", content: result.summary }] }, bindings: [] };
  }
}
