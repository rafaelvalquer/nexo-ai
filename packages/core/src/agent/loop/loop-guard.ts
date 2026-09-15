import { createHash } from "node:crypto";
import { canonicalJson } from "../execution/action-executor.js";
import type { AgentObservation } from "./types.js";

export function observationFingerprint(observation: AgentObservation) { return createHash("sha256").update(`${observation.toolName}:${normalize(observation.summary)}:${canonicalJson(observation.data)}`).digest("hex"); }
export class LoopGuard {
  constructor(private readonly maxSameAction = 2, private readonly maxSameObservation = 2) {}
  evaluate(actions: string[], observations: string[]) {
    if (tailCount(actions) > this.maxSameAction) return { ok: false as const, reason: "STAGNATION: ação repetida sem progresso." };
    if (tailCount(observations) > this.maxSameObservation) return { ok: false as const, reason: "STAGNATION: observação repetida sem progresso." };
    return { ok: true as const };
  }
}
function tailCount(values: string[]) { if (!values.length) return 0; const last = values.at(-1); let count = 0; for (let index = values.length - 1; index >= 0 && values[index] === last; index--) count++; return count; }
function normalize(value: string) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }
