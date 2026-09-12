import { randomUUID } from "node:crypto";
import type { ToolResult } from "@nexo/shared";
import type { NexoDatabase } from "../../database/db.js";
import type { PlanStep } from "../planner.js";
import type { AgentRun, AgentRunStatus, PersistedAgentState } from "./state.js";

type RunRow = { id:string; status:AgentRunStatus; state_json:string; final_response:string|null; created_at:string; updated_at:string };

/** Durable state for an agent execution. Tool execution remains in AgentEngine; this class only persists transitions. */
export class AgentRuntime {
  constructor(private db: NexoDatabase) {}

  start(userRequest: string, steps: PlanStep[]): AgentRun {
    const id = randomUUID(); const now = new Date().toISOString();
    const state: PersistedAgentState = { userRequest, steps, nextStep: 0, results: [], iteration: 0 };
    this.db.run("INSERT INTO agent_runs(id,user_request,status,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?)", [id, userRequest, "RUNNING", JSON.stringify(state), now, now]);
    return { id, status: "RUNNING", state, createdAt: now, updatedAt: now };
  }

  get(id: string): AgentRun | undefined {
    const row = this.db.get<RunRow>("SELECT * FROM agent_runs WHERE id=?", [id]);
    return row && this.toRun(row);
  }

  saveState(id: string, state: PersistedAgentState, status: AgentRunStatus = "RUNNING") {
    this.db.run("UPDATE agent_runs SET state_json=?,status=?,updated_at=? WHERE id=?", [JSON.stringify(state), status, new Date().toISOString(), id]);
  }

  recordStep(runId: string, ordinal: number, step: PlanStep, status: "RUNNING" | "COMPLETED" | "FAILED", result?: ToolResult, error?: string) {
    const id = randomUUID(); const now = new Date().toISOString();
    this.db.run("INSERT INTO agent_steps(id,run_id,ordinal,tool_name,input_json,status,result_json,error,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)", [id, runId, ordinal, step.tool, JSON.stringify(step.input ?? {}), status, result ? JSON.stringify(result) : null, error ?? null, now, status === "RUNNING" ? null : now]);
  }

  checkpoint(runId: string, state: PersistedAgentState) {
    const id = randomUUID(); const now = new Date().toISOString();
    this.db.run("INSERT INTO agent_checkpoints(id,run_id,state_json,status,created_at) VALUES(?,?,?,?,?)", [id, runId, JSON.stringify(state), "WAITING_APPROVAL", now]);
    this.saveState(runId, state, "WAITING_APPROVAL");
    return id;
  }

  attachApproval(checkpointId: string, approvalId: string) { this.db.run("UPDATE agent_checkpoints SET approval_id=? WHERE id=?", [approvalId, checkpointId]); }

  resume(checkpointId: string): { run: AgentRun; state: PersistedAgentState } | undefined {
    const checkpoint = this.db.get<{run_id:string;state_json:string;status:string}>("SELECT * FROM agent_checkpoints WHERE id=?", [checkpointId]);
    if (!checkpoint || checkpoint.status !== "WAITING_APPROVAL") return undefined;
    const state = JSON.parse(checkpoint.state_json) as PersistedAgentState;
    this.db.run("UPDATE agent_checkpoints SET status='RESUMED',resolved_at=? WHERE id=?", [new Date().toISOString(), checkpointId]);
    this.saveState(checkpoint.run_id, state, "RUNNING");
    const run = this.get(checkpoint.run_id);
    return run ? { run, state } : undefined;
  }

  cancelCheckpoint(checkpointId: string, reason = "Ação rejeitada pelo usuário.") {
    const checkpoint = this.db.get<{run_id:string;status:string}>("SELECT run_id,status FROM agent_checkpoints WHERE id=?", [checkpointId]);
    if (!checkpoint || checkpoint.status !== "WAITING_APPROVAL") return false;
    const now = new Date().toISOString();
    this.db.run("UPDATE agent_checkpoints SET status='CANCELLED',resolved_at=? WHERE id=?", [now, checkpointId]);
    this.db.run("UPDATE agent_runs SET status='CANCELLED',final_response=?,updated_at=?,finished_at=? WHERE id=?", [reason, now, now, checkpoint.run_id]);
    return true;
  }

  finish(id: string, status: Extract<AgentRunStatus, "COMPLETED" | "FAILED" | "CANCELLED">, finalResponse: string) {
    const now = new Date().toISOString(); this.db.run("UPDATE agent_runs SET status=?,final_response=?,updated_at=?,finished_at=? WHERE id=?", [status, finalResponse, now, now, id]);
  }

  private toRun(row: RunRow): AgentRun { return { id:row.id, status:row.status, state:JSON.parse(row.state_json), finalResponse:row.final_response ?? undefined, createdAt:row.created_at, updatedAt:row.updated_at }; }
}
