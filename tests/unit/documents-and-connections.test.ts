import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import { MemorySecretStore, type OAuthHost } from "../../packages/core/src/connections/types.js";
import { DocumentService } from "../../packages/core/src/documents/service.js";
import { BackgroundTaskService } from "../../packages/core/src/tasks/background.js";
import AdmZip from "adm-zip";

let root: string; let db: NexoDatabase;
beforeEach(async () => { root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-office-test-")); db = new NexoDatabase(root); await db.ready(); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("connections", () => {
  it("blocks OAuth without a configured public client ID", async () => {
    const service = new ConnectionService(db, new MemorySecretStore());
    await expect(service.connect("google", ["email.read"])).rejects.toThrow(/NEXO_GOOGLE_CLIENT_ID/);
    expect(db.all("SELECT * FROM connections")).toEqual([]);
  });
  it("stores OAuth tokens only in SecretStore", async () => {
    const oldClient = process.env.NEXO_GOOGLE_CLIENT_ID; const oldFetch = globalThis.fetch; process.env.NEXO_GOOGLE_CLIENT_ID = "public-client";
    const secrets = new MemorySecretStore(); let opened = "";
    const host: OAuthHost = { openExternal: async url => { opened = url; }, waitForLoopbackCallback: async () => new URL("http://127.0.0.1/?code=code&state=state"), startLoopbackCallback: async ({state}) => ({redirectUri:"http://127.0.0.1:4567",callback:Promise.resolve(new URL(`http://127.0.0.1:4567/?code=code&state=${state}`))}) };
    globalThis.fetch = (async (url: string | URL) => new Response(JSON.stringify(String(url).includes("userinfo") ? {email:"person@example.com",name:"Person"} : {access_token:"secret-token",refresh_token:"refresh-token"}), {status:200})) as typeof fetch;
    try { const service = new ConnectionService(db,secrets,host); const account = await service.connect("google",["email.read"]); const row=db.get<Record<string,unknown>>("SELECT * FROM connections WHERE id=?",[account.id])!; expect(opened).toContain("code_challenge"); expect(row).not.toHaveProperty("access_token"); expect(await secrets.get(String(row.token_secret_key))).toContain("secret-token"); } finally { globalThis.fetch = oldFetch; if(oldClient===undefined) delete process.env.NEXO_GOOGLE_CLIENT_ID; else process.env.NEXO_GOOGLE_CLIENT_ID=oldClient; }
  });
});

describe("documents", () => {
  it("imports a trusted text file, chunks it and performs lexical search", async () => {
    const source = path.join(root, "contract.txt"); fs.writeFileSync(source, "Contrato Nexo\nPrazo de pagamento: 30 dias.");
    const service = new DocumentService(db, root);
    const document = await service.importFromTrustedPicker(source);
    expect(document.status).toBe("ready");
    expect(service.search(document.id, "pagamento")[0].locator).toBe("Parágrafo 1");
    const exported = path.join(root, "exported.txt"); service.export(document.id, exported);
    expect(fs.readFileSync(exported, "utf8")).toContain("pagamento");
  });
  it("compares two locally indexed documents", async () => {
    const a=path.join(root,"a.txt"),b=path.join(root,"b.txt"); fs.writeFileSync(a,"Cláusula A comum\nValor 100"); fs.writeFileSync(b,"Cláusula A comum\nValor 200"); const service=new DocumentService(db,root); const left=await service.importFromTrustedPicker(a), right=await service.importFromTrustedPicker(b); const result=service.compare([left.id,right.id]);
    expect(result.left.name).toBe("a.txt"); expect(result.right.exclusive.length).toBeGreaterThan(0);
  });
});

describe("background tasks", () => {
  it("persists operational status while a task is running", () => {
    const tasks = new BackgroundTaskService(db); const task = tasks.create("document-import", { source: "trusted-picker" });
    tasks.markRunning(task.id); tasks.setStatus(task.id, "Indexando em partes…");
    expect(tasks.get(task.id)?.statusHistory).toContain("Indexando em partes…");
    expect(db.get<{ progress_json: string }>("SELECT progress_json FROM tasks WHERE id=?", [task.id])?.progress_json).toContain("Indexando");
  });
});

describe("DOCX edits", () => {
  it("writes an immutable new version after a validated replacement", async () => {
    const source = path.join(root, "template.docx"); const zip = new AdmZip();
    zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Cliente Antigo</w:t></w:r></w:p></w:body></w:document>')); zip.writeZip(source);
    const service = new DocumentService(db, root); const document = await service.importFromTrustedPicker(source);
    const result = service.applyEdit(document.id, { documentId: document.id, rationale: "Atualizar cliente", operations: [{ type: "replace_text", find: "Cliente Antigo", replace: "Cliente Novo" }] });
    expect(result.version).toBe(1); expect(fs.readFileSync(result.outputPath)).not.toEqual(fs.readFileSync(path.join(root, "documents", document.id, "source.docx"))); const exported=path.join(root,"edited-copy.docx"); service.export(document.id,exported); expect(fs.readFileSync(exported)).toEqual(fs.readFileSync(result.outputPath));
  });
});
