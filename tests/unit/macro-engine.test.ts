import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { MacroEngine } from "../../packages/core/src/macros/macro-engine.js";

let root: string;
let db: NexoDatabase;
beforeEach(async () => { root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-macro-engine-")); db = new NexoDatabase(root); await db.ready(); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("MacroEngine facade", () => {
  it("exposes macro operations and returns the persisted run record", async () => {
    const macros = new MacroEngine({db,executeCommand:async()=>undefined});
    const macro = macros.create({
      name: "Abrir projeto", enabled: true, trigger: { type: "manual" }, conditions: [], conditionOperator: "AND",
      actions: [{ id: "command", type: "nexo.command", config: { command: "abra chrome" } }], output: { type: "notification" },
      policy: { maxConcurrentRuns: 1, retries: { enabled: false, count: 0 }, onRepeatedFailure: "continue" }
    });

    expect(macros.list()).toHaveLength(1);
    const run = await macros.run(macro.id);
    expect(run).toMatchObject({ automationId: macro.id, status: "success", steps: [{ status: "success" }] });
    expect(macros.getRun(run.id)).toEqual(run);
    expect(macros.remove(macro.id)).toBeUndefined();
    expect(macros.get(macro.id)).toBeUndefined();
    macros.stop();
  });
});
