import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { NexoCore } from "../../packages/core/src/index.js";
import { seedConnectedAccount } from "../helpers/connection-fixture.js";

const tempDirs: string[] = [];
afterEach(() => {
  tempDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

async function coreWithAccount(id: string, provider: "google" | "microsoft") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-pref-"));
  tempDirs.push(dir);
  const db = new NexoDatabase(dir);
  await db.ready();
  seedConnectedAccount({ db, id, provider, capabilities: ["email.read"] });
  const core = new NexoCore({ dataDir: dir });
  await core.ready();
  core.updateSettings({ connectionsEnabled: true });
  await core.ensureConnections();
  // Preference tests do not exercise provider I/O; keep the persisted-connection path real
  // while preventing saveEmailSearchPreferences() from refreshing the live Dashboard.
  (core as any).dashboardRefresh = async () => ({});
  return core;
}

describe("email connection preferences integration", () => {
  it("usa Principal por padrão para contas Google quando nenhuma preferência foi salva", async () => {
    const core = await coreWithAccount("acc-google-1", "google");
    const pref = await core.getEmailSearchPreferences("acc-google-1");
    expect(pref).toMatchObject({
      connectionId: "acc-google-1",
      provider: "google",
      categories: ["primary"]
    });
    expect(pref.options.map(option => option.id)).toEqual(["primary", "promotions", "social", "updates", "forums"]);
  });

  it("salva e restaura preferências personalizadas Google", async () => {
    const core = await coreWithAccount("acc-google-2", "google");
    await core.saveEmailSearchPreferences("acc-google-2", ["primary", "updates"]);
    await expect(core.getEmailSearchPreferences("acc-google-2")).resolves.toMatchObject({
      categories: ["primary", "updates"]
    });
  });

  it("usa somente inbox para Microsoft", async () => {
    const core = await coreWithAccount("acc-microsoft-1", "microsoft");
    const pref = await core.getEmailSearchPreferences("acc-microsoft-1");
    expect(pref.categories).toEqual(["inbox"]);
    expect(pref.options.map(option => option.id)).toEqual(["inbox"]);
  });

  it("rejeita seleção vazia", async () => {
    const core = await coreWithAccount("acc-google-3", "google");
    await expect(core.saveEmailSearchPreferences("acc-google-3", [])).rejects.toThrow("Selecione pelo menos uma caixa.");
  });

  it("remove categorias que não pertencem ao provider antes de persistir", async () => {
    const google = await coreWithAccount("acc-google-4", "google");
    await google.saveEmailSearchPreferences("acc-google-4", ["primary", "inbox"] as any);
    expect((await google.getEmailSearchPreferences("acc-google-4")).categories).toEqual(["primary"]);

    const microsoft = await coreWithAccount("acc-microsoft-2", "microsoft");
    await expect(microsoft.saveEmailSearchPreferences("acc-microsoft-2", ["primary"] as any)).rejects.toThrow("Selecione pelo menos uma caixa.");
  });
});
