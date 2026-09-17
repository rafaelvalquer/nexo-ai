import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AgentEngine } from "../../packages/core/src/agent/engine";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime";
import { ApprovalService } from "../../packages/core/src/permissions/approvals";
import { PermissionEngine } from "../../packages/core/src/permissions/policy";
import { AuditService } from "../../packages/core/src/audit/audit";
import { NexoDatabase } from "../../packages/core/src/database/db";

let root: string, allowedRoot: string, db: NexoDatabase, approvals: ApprovalService, runtime: AgentRuntime, engine: AgentEngine;
const execute = vi.fn(async () => ({ok: true, summary: "Movido para a lixeira"}));
const plan = vi.fn(() => { throw new Error("Ollama must not be called for card actions"); });
beforeEach(async () => {
  vi.clearAllMocks(); root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-card-plan-")); allowedRoot = fs.mkdtempSync(path.join(process.cwd(), ".nexo-card-plan-files-"));
  db = new NexoDatabase(root); await db.ready(); approvals = new ApprovalService(db); runtime = new AgentRuntime(db);
  const tool = {name: "test_trash", description: "Mover arquivo", risk: "CRITICAL", permissions: ["filesystem.write"], mutatesState: true, pathFields: ["path"], inputSchema: z.object({path: z.string()}), execute};
  engine = new AgentEngine({plan, observe: () => ({})} as any, {get: (name: string) => name === tool.name ? tool : undefined} as any, new PermissionEngine(() => ({allowedRoots: [allowedRoot]} as any)), approvals, new AuditService(db), undefined, runtime);
});
afterEach(() => { fs.rmSync(root, {recursive: true, force: true}); if (!allowedRoot.startsWith(`${process.cwd()}${path.sep}.nexo-card-plan-files-`)) throw new Error("Unsafe test cleanup"); fs.rmSync(allowedRoot, {recursive: true, force: true}); });
it("deterministic mutation uses approval and resumes only the exact target without Ollama", async () => {
  const target = path.join(allowedRoot, "report.csv");
  const reply = await engine.runPlan("Mover arquivo selecionado", [{tool: "test_trash", input: {path: target}}]);
  expect(reply.approvalId).toBeTruthy(); expect(execute).not.toHaveBeenCalled(); expect(plan).not.toHaveBeenCalled();
  const approved = approvals.resolve(reply.approvalId!, true)!;
  await engine.resumeApproval(approved.checkpoint_id!);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0][0]).toEqual({path: target});
  await expect(engine.resumeApproval(approved.checkpoint_id!)).rejects.toThrow("Checkpoint");
});
it("cancelling a deterministic approval performs no mutation", async () => {
  const reply = await engine.runPlan("Cancelar teste", [{tool: "test_trash", input: {path: path.join(allowedRoot, "report.csv")}}]);
  const rejected = approvals.resolve(reply.approvalId!, false)!;
  runtime.cancelCheckpoint(rejected.checkpoint_id!);
  await expect(engine.resumeApproval(rejected.checkpoint_id!)).rejects.toThrow("Checkpoint");
  expect(execute).not.toHaveBeenCalled();
});
it("deterministic plans retain allowed-root checks before offering approval", async () => {
  const reply = await engine.runPlan("Fora de escopo", [{tool: "test_trash", input: {path: path.join(root, "..", "outside.csv")}}]);
  expect(reply.text).toContain("fora do escopo"); expect(reply.approvalId).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
});
it("a checkpoint cannot execute before its approval is resolved", async () => {
  const reply=await engine.runPlan("Ação",[{tool:"test_trash",input:{path:path.join(allowedRoot,"report.csv")}}]);
  const approval=approvals.list().find(item=>item.id===reply.approvalId)!;
  await expect(engine.resumeApproval(approval.checkpointId!)).rejects.toThrow("aprovação válida");
  expect(execute).not.toHaveBeenCalled();
});
it("changing a checkpoint target after approval invalidates execution", async () => {
  const reply=await engine.runPlan("Ação",[{tool:"test_trash",input:{path:path.join(allowedRoot,"report.csv")}}]);
  const approved=approvals.resolve(reply.approvalId!,true)!;
  const row=db.get<{state_json:string}>("SELECT state_json FROM agent_checkpoints WHERE id=?",[approved.checkpoint_id])!;
  const state=JSON.parse(row.state_json);state.steps[0].input.path=path.join(allowedRoot,"different.csv");
  db.run("UPDATE agent_checkpoints SET state_json=? WHERE id=?",[JSON.stringify(state),approved.checkpoint_id]);
  await expect(engine.resumeApproval(approved.checkpoint_id)).rejects.toThrow("plano mudou");
  expect(execute).not.toHaveBeenCalled();
});
