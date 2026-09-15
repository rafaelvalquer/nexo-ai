import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@browser_use/pi";
import { createFirstResponseTelemetry } from "../../packages/browser-agent/src/first-response-telemetry";

const event = (value: unknown) => value as AgentEvent;

describe("Browser Agent first response telemetry", () => {
  it("records only lifecycle milestones from the first assistant response", () => {
    const events:string[] = [];
    let current = 1_000;
    const telemetry = createFirstResponseTelemetry(
      diagnostic => events.push(diagnostic),
      500,
      () => current
    );

    telemetry.handle(event({ type:"message_start", message:{ role:"user", content:"secret" } }));
    current = 1_100;
    telemetry.handle(event({ type:"message_start", message:{ role:"assistant", content:[] } }));
    current = 1_200;
    telemetry.handle(event({ type:"message_update", message:{ role:"assistant", content:[] }, assistantMessageEvent:{ type:"text_delta", delta:"hidden" } }));
    current = 1_300;
    telemetry.handle(event({ type:"message_end", message:{ role:"assistant", content:[] } }));
    current = 1_400;
    telemetry.handle(event({ type:"tool_execution_start", toolCallId:"call-1", toolName:"browser", args:{url:"https://example.com"} }));

    expect(events).toEqual([
      "first_model_response_started",
      "first_model_response_delta",
      "first_model_response_completed",
      "first_model_tool_call_received"
    ]);
  });

  it("deduplicates repeated streaming and tool lifecycle events", () => {
    const events:string[] = [];
    const telemetry = createFirstResponseTelemetry(diagnostic => events.push(diagnostic), 0, () => 100);

    telemetry.handle(event({ type:"message_start", message:{ role:"assistant", content:[] } }));
    telemetry.handle(event({ type:"message_start", message:{ role:"assistant", content:[] } }));
    telemetry.handle(event({ type:"message_update", message:{ role:"assistant", content:[] }, assistantMessageEvent:{ type:"text_delta", delta:"a" } }));
    telemetry.handle(event({ type:"message_update", message:{ role:"assistant", content:[] }, assistantMessageEvent:{ type:"text_delta", delta:"b" } }));
    telemetry.handle(event({ type:"tool_execution_start", toolCallId:"call-1", toolName:"browser", args:{} }));
    telemetry.handle(event({ type:"tool_execution_start", toolCallId:"call-2", toolName:"browser", args:{} }));
    telemetry.handle(event({ type:"message_end", message:{ role:"assistant", content:[] } }));
    telemetry.handle(event({ type:"message_end", message:{ role:"assistant", content:[] } }));

    expect(events).toEqual([
      "first_model_response_started",
      "first_model_response_delta",
      "first_model_tool_call_received",
      "first_model_response_completed"
    ]);
  });
});
