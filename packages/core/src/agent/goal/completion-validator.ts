import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AgentArtifact, AgentTaskState, GoalDeliverable } from "./goal-types.js";

export class CompletionValidator {
  async validate(task: AgentTaskState): Promise<{ complete: boolean; reason?: string; taskState: AgentTaskState }> {
    const next = structuredClone(task);
    for (const deliverable of next.goal.deliverables.filter(item => item.required && (item.resolvedPath || item.path))) {
      const expected = deliverable.resolvedPath ?? deliverable.path!;
      try {
        const artifact = next.artifacts.find(item => matches(item, deliverable));
        if (!artifact?.path || !artifact.createdByToolCallId) throw new Error("artifact missing");
        if (deliverable.resolvedPath && canonical(artifact.path) !== canonical(deliverable.resolvedPath)) throw new Error("canonical path mismatch");
        const stat = await fs.stat(artifact.path);
        if (deliverable.kind === "directory") {
          if (!stat.isDirectory() || artifact.kind !== "directory") throw new Error("directory evidence mismatch");
          deliverable.status = "validated";
        } else {
          if (!stat.isFile()) throw new Error("file evidence mismatch");
          const bytes = await fs.readFile(artifact.path);
          const hash = createHash("sha256").update(bytes).digest("hex");
          if (!artifact.sha256 || artifact.sha256 !== hash) throw new Error("evidence mismatch");
          deliverable.status = "validated";
          deliverable.sha256 = hash;
        }
        const validationStep = next.goal.steps.find(step => /Validar o artefato físico/i.test(step.description));
        if (validationStep) {
          validationStep.status = "completed";
          validationStep.evidence = { toolCallId: artifact.createdByToolCallId, references: [{ kind: "path", value: artifact.path }] };
        }
      } catch {
        deliverable.status = "failed";
        next.goal.status = "active";
        return { complete: false, reason: `O entregável ainda não foi validado no destino esperado: ${expected}`, taskState: next };
      }
    }
    const terminal = next.goal.steps.filter(step => step.status === "terminal_failed");
    if (terminal.length) { next.goal.status = "blocked"; return { complete: false, reason: `${terminal.length} etapa(s) falharam de forma terminal.`, taskState: next }; }
    const pending = next.goal.steps.filter(step => step.status !== "completed");
    if (pending.length) { next.goal.status = "active"; return { complete: false, reason: `Ainda há ${pending.length} etapa(s) sem evidência de conclusão.`, taskState: next }; }
    next.goal.status = "completed";
    return { complete: true, taskState: next };
  }
}

function matches(artifact: AgentArtifact, deliverable: GoalDeliverable) {
  if (!artifact.path) return false;
  const expected = deliverable.resolvedPath ?? deliverable.path;
  if (!expected) return false;
  if (deliverable.resolvedPath) return canonical(artifact.path) === canonical(expected);
  const left = artifact.path.toLowerCase(), right = expected.toLowerCase();
  return left === right || (!right.includes("\\") && !right.includes("/") && (left.endsWith(`\\${right}`) || left.endsWith(`/${right}`)));
}
function canonical(value: string) { return (path.win32.isAbsolute(value) ? path.win32.normalize(value) : path.resolve(value)).toLowerCase(); }
