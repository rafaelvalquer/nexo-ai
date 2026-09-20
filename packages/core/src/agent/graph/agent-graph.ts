import { END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { AgentLoopState } from "../loop/types.js";
import { AgentGraphAnnotation } from "./graph-state.js";
import { routeAfterGuard, routeAfterTurn,routeAfterVerifyGoal } from "./graph-router.js";
import { bootstrapNode } from "./nodes/bootstrap.js";
import { agentTurnNode, type AgentTurnNodeHandler } from "./nodes/agent-turn.js";
import { validateCallNode } from "./nodes/validate-call.js";
import { preflightNode } from "./nodes/preflight.js";
import { approvalNode } from "./nodes/approval.js";
import { executeNode } from "./nodes/execute.js";
import { observeNode } from "./nodes/observe.js";
import {verifyGoalNode} from "./nodes/verify-goal.js";
import { reconcileNode } from "./nodes/reconcile.js";
import { loopGuardNode } from "./nodes/loop-guard.js";
import { finalizeNode } from "./nodes/finalize.js";
import {OutcomeVerifier} from "../outcome/verifier.js";

/** Durable orchestration graph. Nodes enforce protocol and persisted state invariants. */
export class AgentGraph {
  constructor(private readonly checkpointer?: BaseCheckpointSaver,private readonly outcomeVerifier:OutcomeVerifier=new OutcomeVerifier()) {}

  async invoke(runId: string, handler: AgentTurnNodeHandler, previous?: AgentLoopState): Promise<AgentLoopState> {
    const graph = new StateGraph(AgentGraphAnnotation)
      .addNode("bootstrap", bootstrapNode)
      .addNode("agent_turn", agentTurnNode(handler))
      .addNode("validate_call", validateCallNode)
      .addNode("preflight", preflightNode)
      .addNode("approval", approvalNode)
      .addNode("execute", executeNode)
      .addNode("observe", observeNode)
      .addNode("verify_goal",verifyGoalNode(this.outcomeVerifier))
      .addNode("reconcile", reconcileNode)
      .addNode("loop_guard", loopGuardNode)
      .addNode("finalize", finalizeNode)
      .addEdge(START, "bootstrap")
      .addEdge("bootstrap", "agent_turn")
      .addConditionalEdges("agent_turn", routeAfterTurn)
      .addEdge("validate_call", "preflight")
      .addEdge("preflight", "execute")
      .addEdge("execute", "observe")
      .addEdge("observe", "verify_goal")
      .addConditionalEdges("verify_goal",routeAfterVerifyGoal)
      .addEdge("reconcile", "finalize")
      .addEdge("approval", "finalize")
      .addConditionalEdges("loop_guard", routeAfterGuard)
      .addEdge("finalize", END)
      .compile({ checkpointer: this.checkpointer ?? false, name: "nexo-agent-v2" });
    const result = await graph.invoke({ runId, stage: "BOOTSTRAP", loopState: previous, error: undefined }, { configurable: { thread_id: runId, checkpoint_ns: "agent-v2" } });
    if (result.error) throw new Error(result.error);
    if (!result.loopState) throw new Error("O Agent Graph terminou sem AgentLoopState.");
    return result.loopState;
  }
}
