import { randomUUID } from "node:crypto";
import type { ToolResult } from "@nexo/shared";
import { PresentationRegistry } from "./registry.js";
import type { PresentationRecord } from "./types.js";
import { emailAdapter } from "./adapters/email.js";
import { filesystemAdapter } from "./adapters/filesystem.js";
import { calendarAdapter } from "./adapters/calendar.js";
import { dailySummaryAdapter,diskUsageAdapter,emailStatsAdapter,memoryUsageAdapter,processListAdapter,systemInfoAdapter } from "./adapters/system.js";
import { safeArraySummaryAdapter } from "./adapters/generic.js";
import { clarificationAdapter } from "./adapters/clarification.js";
import { browserAgentAdapter } from "./adapters/browser-agent.js";
import { emailComposeReviewAdapter } from "./adapters/email-compose.js";
import {webSearchAdapter} from "./adapters/web.js";
import { unwrapPresentationData } from "./internal-metadata.js";

export function defaultPresentationRegistry() {
  return new PresentationRegistry()
    .register(["email_search", "email_get", "email_get_many", "email_get_thread", "email_latest"], emailAdapter)
    .register(["list_files", "search_files", "find_file", "largest_files"], filesystemAdapter)
    .register(["calendar_list", "calendar_list_agent", "calendar_search", "calendar_get"], calendarAdapter)
    .register(["email_stats"], emailStatsAdapter)
    .register(["system_info"],systemInfoAdapter)
    .register(["memory_usage"],memoryUsageAdapter)
    .register(["disk_usage"],diskUsageAdapter)
    .register(["process_list"],processListAdapter)
    .register(["daily_summary"],dailySummaryAdapter)
    .register(["browser_agent_run"], browserAgentAdapter)
    .register(["web_search"],webSearchAdapter)
    .register(["__clarification__"], clarificationAdapter)
    .register(["__email_compose_review__"], emailComposeReviewAdapter)
    .registerFallback(safeArraySummaryAdapter);
}
export class ChatPresentationBuilder {
  constructor(private registry = defaultPresentationRegistry()) {}
  fromToolResult(toolName: string, result: ToolResult, input: Record<string, unknown> = {}): PresentationRecord {
    const adapter = this.registry.get(toolName) ?? this.registry.getFallback();
    const internal = unwrapPresentationData(result.data);
    const effectiveInput = { ...input, ...(internal.input ?? {}) };
    const effectiveResult = internal.input ? { ...result, data: internal.data } : result;
    const projected = effectiveResult.ok ? adapter?.(effectiveResult, { toolName, input: effectiveInput }) : undefined;
    if (projected) return projected;
    return { presentation: { version: 1, blocks: [{ id: randomUUID(), version: 1, type: "text", content: result.summary }] }, bindings: [] };
  }
}
