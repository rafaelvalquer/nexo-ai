import { Annotation } from "@langchain/langgraph";
import type { AgentLoopState } from "../loop/types.js";

export type AgentGraphStage = "BOOTSTRAP" | "AGENT_TURN" | "VALIDATE_CALL" | "PREFLIGHT" | "APPROVAL" | "EXECUTE" | "OBSERVE" | "RECONCILE" | "LOOP_GUARD" | "FINALIZE";

export const AgentGraphAnnotation = Annotation.Root({
  runId: Annotation<string>,
  stage: Annotation<AgentGraphStage>,
  loopState: Annotation<AgentLoopState | undefined>,
  error: Annotation<string | undefined>,
});

export type AgentGraphState = typeof AgentGraphAnnotation.State;
export type AgentGraphUpdate = typeof AgentGraphAnnotation.Update;
