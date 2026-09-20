import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db";
import { NexoCore } from "../../packages/core/src/index";

const tempDirs: string[] = [];
afterEach(() => {
  tempDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("email connection preferences integration", () => {
  it("usa Principal por padrão para contas Google quando nenhuma preferência foi salva", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-pref-test-"));
    tempDirs.push(dir);
    const db = new NexoDatabase(dir);
    await db.ready();

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO connection_accounts(id, provider, capabilities_json, status, created_at, updated_at)
       VALUES('acc-google-1', 'google', '["email.read"]', 'connected', ?, ?)`,
      [now, now]
    );

    const core = new NexoCore({ dataDir: dir });
    await core.ready();

    const pref = await core.getEmailSearchPreferences("acc-google-1");
    expect(pref.connectionId).toBe("acc-google-1");
    expect(pref.provider).toBe("google");
    expect(pref.categories).toEqual(["primary"]);
    expect(pref.options.map(o => o.id)).toEqual(["primary", "promotions", "social", "updates", "forums"]);
  });

  it("salva e restaura preferências personalizadas de caixas de e-mail via NexoCore", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-pref-save-"));
    tempDirs.push(dir);
    const db = new NexoDatabase(dir);
    await db.ready();

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO connection_accounts(id, provider, capabilities_json, status, created_at, updated_at)
       VALUES('acc-google-2', 'google', '["email.read"]', 'connected', ?, ?)`,
      [now, now]
    );

    const core = new NexoCore({ dataDir: dir });
    await core.ready();

    await core.saveEmailSearchPreferences("acc-google-2", ["primary", "updates"]);
    const pref = await core.getEmailSearchPreferences("acc-google-2");
    expect(pref.categories).toEqual(["primary", "updates"]);
  });

  it("rejeita seleção de caixas vazia", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-pref-empty-"));
    tempDirs.push(dir);
    const db = new NexoDatabase(dir);
    await db.ready();

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO connection_accounts(id, provider, capabilities_json, status, created_at, updated_at)
       VALUES('acc-google-3', 'google', '["email.read"]', 'connected', ?, ?)`,
      [now, now]
    );

    const core = new NexoCore({ dataDir: dir });
    await core.ready();

    await expect(core.saveEmailSearchPreferences("acc-google-3", [])).rejects.toThrow("Selecione pelo menos uma caixa.");
  });
});
