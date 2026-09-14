import { randomUUID } from "node:crypto";
import type { Approval, ToolResult } from "@nexo/shared";
import { ChatPresentationBuilder } from "./builder.js";
import type { PresentationRecord } from "./types.js";

/** One execution's presentation; kept separate from public task results and private bindings. */
export class ChatPresentationSession {
  private record: PresentationRecord = { presentation: { version: 1, blocks: [] }, bindings: [] };
  private summaries: string[] = [];
  constructor(private builder = new ChatPresentationBuilder()) {}
  add(toolName: string, input: Record<string, unknown>, result: ToolResult) {
    const next = this.builder.fromToolResult(toolName, result, input);
    this.record.presentation.blocks.push(...next.presentation.blocks);
    this.record.bindings.push(...next.bindings);
    this.summaries.push(result.summary);
    return this.record.presentation;
  }
  finish(text: string, approval?: Approval): PresentationRecord | undefined {
    if (approval) {
      this.record.presentation.blocks.push({ id: randomUUID(), version: 1, type: "approval", approvalId: approval.id, title: approval.reason, preview: approval.preview, consequence: approval.consequence, affectedCount: approval.affectedCount, expiresAt: approval.expiresAt, status: approval.status });
    } else if (this.record.presentation.blocks.length && text && !this.summaries.includes(text) && text !== this.summaries.join("\n")) {
      this.record.presentation.blocks.push({ id: randomUUID(), version: 1, type: "text", content: text });
    }
    return this.record.presentation.blocks.length ? this.record : undefined;
  }
}
