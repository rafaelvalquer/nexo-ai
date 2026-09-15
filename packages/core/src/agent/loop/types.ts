import type { PreparedAction } from "../execution/types.js";

export type AgentLoopStatus = "DECIDING" | "PREFLIGHT" | "WAITING_APPROVAL" | "EXECUTING" | "OBSERVING" | "WAITING_EXTERNAL_PROGRESS" | "RESULT_UNKNOWN" | "COMPLETED" | "FAILED" | "CANCELLED";
export type AgentMessageTrust = "TRUSTED_LOCAL" | "UNTRUSTED_CONTENT" | "SENSITIVE_LOCAL";
export type AgentModelMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; trust?: AgentMessageTrust; toolCallId?: string };
export type AgentToolSchema = { name: string; description: string; parameters?: unknown };
export type AgentToolCall = { id: string; name: string; arguments: Record<string, unknown> };
export type AgentModelTurn = { content?: string; toolCalls: AgentToolCall[] };
export type AgentTurnRequest = { messages: AgentModelMessage[]; tools: AgentToolSchema[]; model?: string };

export interface PendingAgentAction { callId: string; toolName: string; input: Record<string, unknown>; fingerprint: string; executionId: string; idempotencyKey?: string; iteration: number; mutatesState: boolean; approvalId?: string; }
export type AgentReference = { kind: "id" | "path" | "url" | "message_id" | "event_id" | "thread_id" | "file_id" | "process_id"; value: string; label?: string };
export interface AgentObservation { toolCallId: string; toolName: string; ok: boolean; summary: string; data?: unknown; references?: AgentReference[]; trust: AgentMessageTrust; truncated: boolean; originalBytes?: number; encodedBytes?: number; progress?: { key?: string; value?: string | number }; }
export interface AgentLoopState { version: 2; runId: string; conversationId?: string; taskId?: string; userRequest: string; messages: AgentModelMessage[]; observations: AgentObservation[]; pendingAction?: PendingAgentAction; iteration: number; toolCallCount: number; consecutiveFailures: number; protocolRepairCount: number; startedAt: string; deadlineAt: string; status: AgentLoopStatus; finalResponse?: string; }

export type AgentLoopLimits = { maxIterations: number; maxToolCalls: number; maxProtocolRepairAttempts: number; maxSchemaRepairAttempts: number; maxConsecutiveFailures: number; maxSameActionWithoutProgress: number; maxObservationBytes: number; maxTotalObservationBytes: number; maxToolResultReferences: number; };
export const DEFAULT_AGENT_LOOP_LIMITS: AgentLoopLimits = { maxIterations: 12, maxToolCalls: 12, maxProtocolRepairAttempts: 2, maxSchemaRepairAttempts: 2, maxConsecutiveFailures: 3, maxSameActionWithoutProgress: 2, maxObservationBytes: 64_000, maxTotalObservationBytes: 256_000, maxToolResultReferences: 100 };
export type AgentLoopDependencies = { agentTurn(request: AgentTurnRequest, signal?: AbortSignal): Promise<AgentModelTurn>; tools(): AgentToolSchema[]; preflight(name: string, input: Record<string, unknown>, context: { runId: string; signal?: AbortSignal }): Promise<import("../execution/types.js").ActionPreflightResult>; execute(action: PreparedAction, context: { runId: string; signal?: AbortSignal }): Promise<import("../execution/types.js").ActionExecutionResult>; observe(result: import("../execution/types.js").ActionExecutionResult, callId: string): AgentObservation; };
