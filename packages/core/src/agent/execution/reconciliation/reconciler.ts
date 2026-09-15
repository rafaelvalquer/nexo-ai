import type { ToolResult } from "@nexo/shared";
import type { ExecutionRecord } from "../execution-record-repository.js";
export type ReconciliationResult = { status: "confirmed_success"; result?: ToolResult } | { status: "confirmed_failure" } | { status: "still_unknown"; reason?: string };
export interface MutationReconciler { supports(record: ExecutionRecord): boolean; reconcile(record: ExecutionRecord, signal?: AbortSignal): Promise<ReconciliationResult>; }
