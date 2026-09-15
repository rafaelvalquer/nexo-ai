import type { AgentEvent } from "@browser_use/pi";
import type { BrowserDiagnosticEventName } from "@nexo/shared/browser-agent";

export type FirstResponseDiagnosticEmitter = (event: BrowserDiagnosticEventName, durationMs: number) => void;

/**
 * Tracks only lifecycle metadata from the first assistant response.
 * It never records message text, reasoning, tool arguments, credentials, or page content.
 */
export function createFirstResponseTelemetry(
  emit: FirstResponseDiagnosticEmitter,
  startedAt = Date.now(),
  now: () => number = Date.now
) {
  let responseStarted = false;
  let firstDelta = false;
  let responseCompleted = false;
  let toolCallReceived = false;

  const duration = () => Math.max(0, now() - startedAt);

  return {
    handle(event: AgentEvent) {
      if (event.type === "message_start" && isAssistantMessage(event.message) && !responseStarted) {
        responseStarted = true;
        emit("first_model_response_started", duration());
        return;
      }

      if (event.type === "message_update" && !firstDelta) {
        firstDelta = true;
        emit("first_model_response_delta", duration());
        return;
      }

      if (event.type === "message_end" && isAssistantMessage(event.message) && !responseCompleted) {
        responseCompleted = true;
        emit("first_model_response_completed", duration());
        return;
      }

      if (event.type === "tool_execution_start" && !toolCallReceived) {
        toolCallReceived = true;
        emit("first_model_tool_call_received", duration());
      }
    }
  };
}

function isAssistantMessage(message: unknown) {
  return Boolean(message && typeof message === "object" && (message as { role?: unknown }).role === "assistant");
}
