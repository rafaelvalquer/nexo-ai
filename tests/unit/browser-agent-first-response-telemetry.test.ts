import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@browser_use/pi";
import { createFirstResponseTelemetry } from "../../packages/browser-agent/src/first-response-telemetry";

describe("Browser Agent first response telemetry", () => {
  it("records only lifecycle milestones from the first assistant response", () => {
    const events:string[] = [];
    let current = 1_000;
    const telemetry = createFirstResponseTelemetry(
      event => events.push(event),
      500,
      () => current
    );

    telemetry.handle({ type:"message_start", message:{ role:"user", content:"secret" } } as AgentEvent);
    current = 1_100;
    telemetry.handle({ type:"message_start", message:{ role:"assistant", content:[] } } as AgentEvent);
    current = 1_200;
    telemetry.handle({ type:"message_update", message:{ role:"assistant", content:[] }, assistantMessageEvent:{ type:"text_delta", delta:"hidden" } } as AgentEvent);
    current = 1_300;
    telemetry.handle({ type:"message_end", message:{ role:"assistant", content:[] } } as AgentEvent);
    current = 1_400;
    telemetry.handle({ type:"tool_execution_start", toolCallId:"call-1", toolName:"browser", args:{url:"https://example.com"} } as AgentEvent);

    expect(events).toEqual([
      "first_model_response_started",
      "first_model_response_delta",
      "first_model_response_completed",
      "first_model_tool_call_received"
    ]);
  });

  it("deduplicates repeated streaming and tool lifecycle events", () => {
    const events:string[] = [];
    const telemetry = createFirstResponseTelemetry(event => events.push(event), 0, () => 100);

    telemetry.handle({ type:"message_start", message:{ role:"assistant", content:[] } } as AgentEvent);
    telemetry.handle({ type:"message_start", message:{ role:"assistant", content:[] } } as AgentEvent);
    telemetry.handle({ type:"message_update", message:{ role:"assistant", content:[] }, assistantMessageEvent:{ type:"text_delta", delta:"a" } } as AgentEvent);
    telemetry.handle({ type:"message_update", message:{ role:"assistant", content:[] }, assistantMessageEvent:{ type:"text_delta", delta:"b" } } as AgentEvent);
    telemetry.handle({ type:"tool_execution_start", toolCallId:"call-1", toolName:"browser", args:{} } as AgentEvent);
    telemetry.handle({ type:"tool_execution_start", toolCallId:"call-2", toolName:"browser", args:{} } as AgentEvent);
    telemetry.handle({ type:"message_end", message:{ role:"assistant", content:[] } } as AgentEvent);
    telemetry.handle({ type:"message_end", message:{ role:"assistant", content:[] } } as AgentEvent);

    expect(events).toEqual([
      "first_model_response_started",
      "first_model_response_delta",
      "first_model_tool_call_received",
      "first_model_response_completed"
    ]);
  });
});
