import type { AgentVisualEvent } from "@nexo/shared";
export const event=(type:AgentVisualEvent["type"],overrides:Partial<AgentVisualEvent>={}):AgentVisualEvent=>({eventId:`event-${type}`,runId:"run-1",agentId:"nexo",timestamp:"2026-09-12T12:00:00.000Z",type,state:"planning",label:type,...overrides});
