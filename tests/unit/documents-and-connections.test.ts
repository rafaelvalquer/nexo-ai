import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import { MemorySecretStore, type OAuthHost } from "../../packages/core/src/connections/types.js";
import { DocumentService } from "../../packages/core/src/documents/service.js";
import { BackgroundTaskService } from "../../packages/core/src/tasks/background.js";
import { AuditService } from "../../packages/core/src/audit/audit.js";
import { TokenManager } from "../../packages/core/src/auth/token-manager.js";
import { EmailService } from "../../packages/core/src/email/service.js";
import { applyDocxEdit } from "../../packages/core/src/documents/edit/docx-ooxml.js";
import { CalendarService } from "../../packages/core/src/calendar/service.js";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime.js";
import AdmZip from "adm-zip";

let root: string; let db: NexoDatabase;
beforeEach(async () => { root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-office-test-")); db = new NexoDatabase(root); await db.ready(); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("connections", () => {
  it("blocks OAuth without a configured public client ID", async () => {
    const service = new ConnectionService(db, new MemorySecretStore());
    await expect(service.connect("google", ["email.read"])).rejects.toThrow(/Conexões/);
    expect(db.all("SELECT * FROM connections")).toEqual([]);
  });
  it("prefers persisted OAuth configuration over development environment values", async () => {
    const oldClient = process.env.NEXO_MICROSOFT_CLIENT_ID; const oldTenant = process.env.NEXO_MICROSOFT_TENANT; const oldFetch = globalThis.fetch;
    process.env.NEXO_MICROSOFT_CLIENT_ID = "environment-client"; process.env.NEXO_MICROSOFT_TENANT = "environment-tenant";
    let opened = ""; const secrets = new MemorySecretStore();
    const host: OAuthHost = { openExternal: async url => { opened = url; }, waitForLoopbackCallback: async () => new URL("http://localhost/?code=code&state=state"), startLoopbackCallback: async ({ state }) => ({ redirectUri: "http://localhost:4567/oauth/callback", callback: Promise.resolve(new URL(`http://localhost:4567/oauth/callback?code=code&state=${state}`)) }) };
    globalThis.fetch = (async (url: string | URL) => new Response(JSON.stringify(String(url).includes("/me") ? {mail:"person@example.com",displayName:"Person"} : {access_token:"secret-token"}), {status:200})) as typeof fetch;
    try {
      const service = new ConnectionService(db, secrets, host, () => ({ googleClientId: "", microsoftClientId: "saved-client", microsoftTenant: "common" }));
      await service.connect("microsoft", ["calendar.read"]);
      expect(opened).toContain("client_id=saved-client"); expect(opened).toContain("login.microsoftonline.com/common/"); expect(opened).toContain(encodeURIComponent("http://localhost:4567/oauth/callback"));
    } finally { globalThis.fetch = oldFetch; if (oldClient === undefined) delete process.env.NEXO_MICROSOFT_CLIENT_ID; else process.env.NEXO_MICROSOFT_CLIENT_ID = oldClient; if (oldTenant === undefined) delete process.env.NEXO_MICROSOFT_TENANT; else process.env.NEXO_MICROSOFT_TENANT = oldTenant; }
  });
  it("stores OAuth tokens only in SecretStore", async () => {
    const oldClient = process.env.NEXO_GOOGLE_CLIENT_ID; const oldFetch = globalThis.fetch; process.env.NEXO_GOOGLE_CLIENT_ID = "public-client";
    const secrets = new MemorySecretStore(); let opened = "";
    const host: OAuthHost = { openExternal: async url => { opened = url; }, waitForLoopbackCallback: async () => new URL("http://127.0.0.1/?code=code&state=state"), startLoopbackCallback: async ({state}) => ({redirectUri:"http://127.0.0.1:4567",callback:Promise.resolve(new URL(`http://127.0.0.1:4567/?code=code&state=${state}`))}) };
    globalThis.fetch = (async (url: string | URL) => new Response(JSON.stringify(String(url).includes("userinfo") ? {email:"person@example.com",name:"Person"} : {access_token:"secret-token",refresh_token:"refresh-token"}), {status:200})) as typeof fetch;
    try { const service = new ConnectionService(db,secrets,host); const account = await service.connect("google",["email.read"]); const row=db.get<Record<string,unknown>>("SELECT * FROM connections WHERE id=?",[account.id])!; expect(opened).toContain("code_challenge"); expect(row).not.toHaveProperty("access_token"); expect(await secrets.get(String(row.token_secret_key))).toContain("secret-token"); } finally { globalThis.fetch = oldFetch; if(oldClient===undefined) delete process.env.NEXO_GOOGLE_CLIENT_ID; else process.env.NEXO_GOOGLE_CLIENT_ID=oldClient; }
  });
  it("reauthorizes incrementally instead of asserting new scopes locally", async () => {
    const oldClient = process.env.NEXO_GOOGLE_CLIENT_ID; const oldFetch = globalThis.fetch; process.env.NEXO_GOOGLE_CLIENT_ID = "public-client";
    const secrets = new MemorySecretStore(); let opens = 0;
    const host: OAuthHost = { openExternal: async () => { opens++; }, waitForLoopbackCallback: async () => new URL("http://localhost/?code=code&state=state"), startLoopbackCallback: async ({ state }) => ({ redirectUri: "http://localhost:4567/oauth/callback", callback: Promise.resolve(new URL(`http://localhost:4567/oauth/callback?code=code&state=${state}`)) }) };
    globalThis.fetch = (async (url: string | URL) => new Response(JSON.stringify(String(url).includes("userinfo") ? {email:"person@example.com",name:"Person"} : {access_token:"token",refresh_token:"refresh",expires_in:3600}), {status:200})) as typeof fetch;
    try {
      const service = new ConnectionService(db, secrets, host); const account = await service.connect("google", ["email.read"]); const expanded = await service.addCapabilities(account.id, ["calendar.write"]);
      expect(expanded.id).toBe(account.id); expect(expanded.capabilities).toEqual(["email.read", "calendar.write"]); expect(opens).toBe(2); expect(db.all("SELECT * FROM connections")).toHaveLength(1);
    } finally { globalThis.fetch = oldFetch; if (oldClient === undefined) delete process.env.NEXO_GOOGLE_CLIENT_ID; else process.env.NEXO_GOOGLE_CLIENT_ID = oldClient; }
  });
});

describe("token manager", () => {
  it("refreshes an expired token and rotates the refresh token in the secret store", async () => {
    const oldFetch = globalThis.fetch; const secrets = new MemorySecretStore();
    await secrets.set("connection:test:tokens", JSON.stringify({ access_token: "old", refresh_token: "old-refresh", expires_at: "2000-01-01T00:00:00.000Z" }));
    globalThis.fetch = (async () => new Response(JSON.stringify({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 }), { status: 200 })) as typeof fetch;
    try {
      const manager = new TokenManager(secrets, () => ({ googleClientId: "client", microsoftClientId: "", microsoftTenant: "common" }));
      await expect(manager.accessToken("google", "connection:test:tokens")).resolves.toMatchObject({ accessToken: "fresh", refreshed: true });
      expect(await secrets.get("connection:test:tokens")).toContain("rotated");
    } finally { globalThis.fetch = oldFetch; }
  });
  it("requires reconnect when an expired token has no refresh token", async () => {
    const secrets = new MemorySecretStore(); await secrets.set("connection:test:tokens", JSON.stringify({ access_token: "old", expires_at: "2000-01-01T00:00:00.000Z" }));
    const manager = new TokenManager(secrets, () => ({ googleClientId: "client", microsoftClientId: "", microsoftTenant: "common" }));
    await expect(manager.accessToken("google", "connection:test:tokens")).rejects.toThrow(/Reconecte/);
  });
});

describe("email search", () => {
  it("uses Microsoft filters, search, ordering and Graph pagination", async () => {
    const oldFetch = globalThis.fetch; let requested = ""; let headers: HeadersInit | undefined;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => { requested = String(url); headers = init?.headers; return new Response(JSON.stringify({ value: [{ id:"m1", subject:"Contrato", from:{emailAddress:{address:"a@example.com"}}, toRecipients:[], receivedDateTime:"2026-01-01T10:00:00Z", bodyPreview:"texto", isRead:false, hasAttachments:false }], "@odata.nextLink":"https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next", "@odata.count": 12 }), {status:200}); }) as typeof fetch;
    try {
      const service = new EmailService({ get: () => ({ id:"connection", provider:"microsoft" }), accessToken: async () => "token" } as any);
      const result = await service.search({ connectionId:"connection", query:"contrato", unread:true, maxResults:10 }); const url = new URL(requested);
      expect(url.searchParams.get("$filter")).toBe("isRead eq false"); expect(url.searchParams.get("$search")).toBe('"contrato"'); expect(url.searchParams.get("$orderby")).toBe("receivedDateTime desc"); expect(result.nextPageToken).toContain("$skiptoken"); expect(result.total).toBe(12); expect(result.messages).toHaveLength(1); expect(headers).toMatchObject({ConsistencyLevel:"eventual"});
    } finally { globalThis.fetch = oldFetch; }
  });
  it("maps provider-safe email modifications to Gmail and Microsoft Graph", async () => {
    const oldFetch = globalThis.fetch; const calls:string[]=[]; globalThis.fetch = (async (url: string | URL) => { calls.push(String(url)); return new Response("{}", {status:200}); }) as typeof fetch;
    try {
      const google = new EmailService({get:()=>({provider:"google"}),accessToken:async()=>"token"} as any); const microsoft = new EmailService({get:()=>({provider:"microsoft"}),accessToken:async()=>"token"} as any);
      await google.modify("connection","message","archive"); await microsoft.modify("connection","message","trash");
      expect(calls[0]).toContain("gmail.googleapis.com/gmail/v1/users/me/messages/message/modify"); expect(calls[1]).toContain("graph.microsoft.com/v1.0/me/messages/message/move");
    } finally { globalThis.fetch = oldFetch; }
  });
  it("loads detailed Microsoft message content", async () => {
    const oldFetch = globalThis.fetch; globalThis.fetch = (async () => new Response(JSON.stringify({id:"m1",subject:"Assunto",from:{emailAddress:{address:"a@example.com"}},toRecipients:[],receivedDateTime:"2026-01-01T00:00:00Z",body:{content:"Corpo"},isRead:true,hasAttachments:false,conversationId:"thread"}),{status:200})) as typeof fetch;
    try { const service = new EmailService({get:()=>({provider:"microsoft"}),accessToken:async()=>"token"} as any); await expect(service.getMessage("connection","m1")).resolves.toMatchObject({threadId:"thread",bodyText:"Corpo"}); } finally { globalThis.fetch = oldFetch; }
  });
  it("downloads a Gmail attachment with exclusive file creation", async () => {
    const oldFetch=globalThis.fetch; const destination=path.join(root,"attachment.txt"); globalThis.fetch=(async()=>new Response(JSON.stringify({data:Buffer.from("arquivo").toString("base64url")}),{status:200})) as typeof fetch;
    try { const service=new EmailService({get:()=>({provider:"google"}),accessToken:async()=>"token"} as any); await expect(service.downloadAttachment("connection","message","attachment",destination)).resolves.toMatchObject({size:7,destination}); expect(fs.readFileSync(destination,"utf8")).toBe("arquivo"); await expect(service.downloadAttachment("connection","message","attachment",destination)).rejects.toThrow(); } finally {globalThis.fetch=oldFetch;}
  });
  it("maps move and label actions to provider-specific operations", async () => {
    const oldFetch=globalThis.fetch; const calls:string[]=[]; globalThis.fetch=(async(url:string|URL)=>{calls.push(String(url));return new Response(JSON.stringify({categories:[]}),{status:200});}) as typeof fetch;
    try { const google=new EmailService({get:()=>({provider:"google"}),accessToken:async()=>"token"} as any); const microsoft=new EmailService({get:()=>({provider:"microsoft"}),accessToken:async()=>"token"} as any); await google.modify("c","m","add_label","LABEL_1");await microsoft.modify("c","m","move","folder-id"); expect(calls[0]).toContain("gmail.googleapis.com");expect(calls[1]).toContain("/me/messages/m/move"); } finally {globalThis.fetch=oldFetch;}
  });
});

describe("calendar availability", () => {
  it("finds slots around busy calendar events", async () => {
    const oldFetch = globalThis.fetch; globalThis.fetch = (async () => new Response(JSON.stringify({ items:[{id:"e1",summary:"Reunião",start:{dateTime:"2026-09-12T10:00:00.000Z"},end:{dateTime:"2026-09-12T11:00:00.000Z"}}] }), {status:200})) as typeof fetch;
    try {
      const service = new CalendarService({ get: () => ({provider:"google"}), accessToken: async () => "token" } as any);
      const slots = await service.findFreeTime("connection", "2026-09-12T09:00:00.000Z", "2026-09-12T12:00:00.000Z", 30);
      expect(slots).toEqual([{start:"2026-09-12T09:00:00.000Z",end:"2026-09-12T09:30:00.000Z"},{start:"2026-09-12T11:00:00.000Z",end:"2026-09-12T11:30:00.000Z"}]);
    } finally { globalThis.fetch = oldFetch; }
  });
  it("lists Google calendars with primary metadata", async () => {
    const oldFetch = globalThis.fetch; globalThis.fetch = (async () => new Response(JSON.stringify({items:[{id:"primary",summary:"Pessoal",primary:true,timeZone:"America/Sao_Paulo"}]}), {status:200})) as typeof fetch;
    try { const service=new CalendarService({get:()=>({provider:"google"}),accessToken:async()=>"token"} as any); await expect(service.listCalendars("connection")).resolves.toEqual([{id:"primary",name:"Pessoal",primary:true,timeZone:"America/Sao_Paulo"}]); } finally { globalThis.fetch=oldFetch; }
  });
  it("updates events, responds to invitations and creates online meetings on Microsoft", async () => {
    const oldFetch = globalThis.fetch; const calls:Array<{url:string;init?:RequestInit}>=[];
    globalThis.fetch = (async (url:string|URL, init?:RequestInit) => { calls.push({url:String(url),init}); return new Response(JSON.stringify({id:"event",subject:"Reunião",start:{dateTime:"2026-09-12T10:00:00Z"},end:{dateTime:"2026-09-12T11:00:00Z"}}),{status:200}); }) as typeof fetch;
    try {
      const service=new CalendarService({get:()=>({provider:"microsoft"}),accessToken:async()=>"token"} as any);
      await service.update("connection","event",{title:"Novo título"}); await service.rsvp("connection","event","accept"); await service.createMeeting("connection",{title:"Reunião",start:"2026-09-12T10:00:00Z",end:"2026-09-12T11:00:00Z"});
      expect(calls[0].url).toContain("/me/events/event"); expect(calls[0].init?.method).toBe("PATCH"); expect(calls[1].url).toContain("/events/event/accept"); expect(calls[2].init?.body).toContain("isOnlineMeeting");
    } finally { globalThis.fetch=oldFetch; }
  });
  it("sends all-day events using the provider-specific calendar payload", async () => {
    const oldFetch=globalThis.fetch; let body=""; globalThis.fetch=(async (_url:string|URL,init?:RequestInit)=>{body=String(init?.body);return new Response(JSON.stringify({id:"event",summary:"Feriado",start:{date:"2026-09-12"},end:{date:"2026-09-13"}}),{status:200});}) as typeof fetch;
    try { const service=new CalendarService({get:()=>({provider:"google"}),accessToken:async()=>"token"} as any); await service.create("connection",{title:"Feriado",start:"2026-09-12T00:00:00.000Z",end:"2026-09-13T00:00:00.000Z",allDay:true}); expect(body).toContain('"date":"2026-09-12"'); expect(body).not.toContain("dateTime"); } finally {globalThis.fetch=oldFetch;}
  });
  it("converts common RRULE weekly recurrence for Microsoft Graph", async () => {
    const oldFetch=globalThis.fetch; let body=""; globalThis.fetch=(async (_url:string|URL,init?:RequestInit)=>{body=String(init?.body);return new Response(JSON.stringify({id:"event",subject:"Semanal",start:{dateTime:"2026-09-14T10:00:00Z"},end:{dateTime:"2026-09-14T11:00:00Z"}}),{status:200});}) as typeof fetch;
    try { const service=new CalendarService({get:()=>({provider:"microsoft"}),accessToken:async()=>"token"} as any); await service.create("connection",{title:"Semanal",start:"2026-09-14T10:00:00Z",end:"2026-09-14T11:00:00Z",recurrence:["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]}); expect(body).toContain('"type":"weekly"');expect(body).toContain('"monday"');expect(body).toContain('"wednesday"'); } finally {globalThis.fetch=oldFetch;}
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
  it("uses a dedicated embedding provider for hybrid document retrieval with lexical fallback", async () => {
    const source = path.join(root, "semantic.txt"); fs.writeFileSync(source, "Prazo contratual de trinta dias para pagamento.");
    const embeddings = { embed: async (text: string) => text.toLowerCase().includes("prazo") || text.toLowerCase().includes("vencimento") ? [1, 0] : [0, 1] };
    const service = new DocumentService(db, root, 50, embeddings as any); const document = await service.importFromTrustedPicker(source);
    const row = db.get<{embedding_json:string}>("SELECT embedding_json FROM document_chunks WHERE document_id=?", [document.id]); expect(row?.embedding_json).toBe("[1,0]");
    await expect(service.answer([document.id], "qual o vencimento?")).resolves.toMatchObject({sources:[{document:"semantic.txt",locator:"Parágrafo 1"}]});
  });
});

describe("background tasks", () => {
  it("persists operational status while a task is running", () => {
    const tasks = new BackgroundTaskService(db); const task = tasks.create("document-import", { source: "trusted-picker" });
    tasks.markRunning(task.id); tasks.setStatus(task.id, "Indexando em partes…");
    expect(tasks.get(task.id)?.statusHistory).toContain("Indexando em partes…");
    expect(db.get<{ progress_json: string }>("SELECT progress_json FROM tasks WHERE id=?", [task.id])?.progress_json).toContain("Indexando");
  });
  it("batches streaming token persistence instead of exporting on every token", () => {
    vi.useFakeTimers();
    try {
      const tasks = new BackgroundTaskService(db); const task = tasks.create("assistant-chat", { text: "hello" });
      tasks.markRunning(task.id); tasks.appendProgress(task.id, "a"); tasks.appendProgress(task.id, "b");
      expect(db.get<{ progress_json: string }>("SELECT progress_json FROM tasks WHERE id=?", [task.id])?.progress_json).not.toContain("ab");
      vi.advanceTimersByTime(350);
      expect(db.get<{ progress_json: string }>("SELECT progress_json FROM tasks WHERE id=?", [task.id])?.progress_json).toContain("ab");
    } finally { vi.useRealTimers(); }
  });
  it("keeps private task content ephemeral", () => {
    const tasks = new BackgroundTaskService(db, () => true); const task = tasks.create("assistant-chat", { text: "segredo" });
    tasks.complete(task.id, { text: "resposta privada" });
    const row = db.get<{ input_json: string; result_json: string | null }>("SELECT input_json,result_json FROM tasks WHERE id=?", [task.id])!;
    expect(row.input_json).not.toContain("segredo"); expect(row.result_json).toBeNull(); expect(tasks.get(task.id)?.result).toEqual({ text: "resposta privada" });
  });
  it("cancels an active assistant task and removes it from the active list", () => {
    const tasks = new BackgroundTaskService(db); const task = tasks.create("assistant-chat", { text: "continue" });
    tasks.markRunning(task.id);
    expect(tasks.cancel(task.id)).toBe(true);
    expect(tasks.get(task.id)?.status).toBe("cancelled");
    expect(tasks.get(task.id)?.error).toBe("Cancelada pelo usuário.");
    expect(tasks.listActive()).not.toContainEqual(expect.objectContaining({ id: task.id }));
    tasks.appendProgress(task.id, "token atrasado");
    expect(tasks.get(task.id)?.progressText).toBeUndefined();
    expect(tasks.cancel(task.id)).toBe(false);
  });
  it("marks interrupted queued or running tasks as failed during startup recovery", () => {
    const tasks = new BackgroundTaskService(db); const queued = tasks.create("assistant-chat", { text: "retomar" }); const running = tasks.create("assistant-chat", { text: "executando" }); tasks.markRunning(running.id);
    new BackgroundTaskService(db).recoverInterruptedTasks();
    expect(tasks.get(queued.id)).toMatchObject({ status: "failed", error: "A tarefa foi interrompida por um encerramento anterior do Nexo." });
    expect(tasks.get(running.id)).toMatchObject({ status: "failed", error: "A tarefa foi interrompida por um encerramento anterior do Nexo." });
    expect(tasks.listActive()).toHaveLength(0);
  });
});

describe("agent checkpoints", () => {
  it("persists an approval checkpoint and resumes its exact pending step", () => {
    const runtime = new AgentRuntime(db);
    const run = runtime.start("arquive a mensagem", [{ tool:"email_archive", input:{ connectionId:"c", messageId:"m" } }]);
    const checkpointId = runtime.checkpoint(run.id, run.state);
    runtime.attachApproval(checkpointId, "approval-1");
    expect(db.get<{status:string;approval_id:string}>("SELECT status,approval_id FROM agent_checkpoints WHERE id=?", [checkpointId])).toEqual({status:"WAITING_APPROVAL",approval_id:"approval-1"});
    const resumed = runtime.resume(checkpointId);
    expect(resumed?.run.id).toBe(run.id); expect(resumed?.state.steps[0].tool).toBe("email_archive");
    expect(runtime.resume(checkpointId)).toBeUndefined();
  });
  it("cancels the persisted run when its approval is rejected", () => {
    const runtime = new AgentRuntime(db); const run = runtime.start("envie o e-mail", [{tool:"email_send",input:{}}]); const checkpointId = runtime.checkpoint(run.id, run.state);
    expect(runtime.cancelCheckpoint(checkpointId)).toBe(true);
    expect(db.get<{status:string}>("SELECT status FROM agent_runs WHERE id=?",[run.id])?.status).toBe("CANCELLED");
    expect(runtime.resume(checkpointId)).toBeUndefined();
  });
});

describe("private audit", () => {
  it("redacts audit details while private mode is active", () => {
    const audit = new AuditService(db, () => true); audit.record("email_search", "READ", "success", { body: "conteúdo confidencial" });
    expect(db.get<{ details_json: string }>("SELECT details_json FROM audit_logs LIMIT 1")?.details_json).toBe('{"redacted":true}');
  });
  it("redacts sensitive content in normal audit records while retaining operational metadata", () => {
    const audit = new AuditService(db); audit.record("email_send", "SENSITIVE", "success", { input:{to:[{email:"person@example.com"}],bodyText:"mensagem confidencial",access_token:"secret"}, result:{ok:true} });
    const saved = JSON.parse(db.get<{ details_json: string }>("SELECT details_json FROM audit_logs LIMIT 1")!.details_json);
    expect(saved.input.to).toEqual({count:1}); expect(saved.input.bodyText).toEqual({redacted:true,length:21}); expect(saved.input.access_token).toBe("[REDACTED]"); expect(saved.result.ok).toBe(true);
  });
});

describe("DOCX edits", () => {
  it("writes an immutable new version after a validated replacement", async () => {
    const source = path.join(root, "template.docx"); const zip = new AdmZip();
    zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Cliente Antigo</w:t></w:r></w:p></w:body></w:document>')); zip.writeZip(source);
    const service = new DocumentService(db, root); const document = await service.importFromTrustedPicker(source);
    const result = await service.applyEdit(document.id, { documentId: document.id, rationale: "Atualizar cliente", operations: [{ type: "replace_text", find: "Cliente Antigo", replace: "Cliente Novo" }] });
    expect(result.version).toBe(1); expect(fs.readFileSync(result.outputPath)).not.toEqual(fs.readFileSync(path.join(root, "documents", document.id, "source.docx"))); const exported=path.join(root,"edited-copy.docx"); service.export(document.id,exported); expect(fs.readFileSync(exported)).toEqual(fs.readFileSync(result.outputPath)); expect(service.previewData(document.id).data).toEqual(fs.readFileSync(result.outputPath));
    const next = await service.applyEdit(document.id, { documentId: document.id, rationale: "Atualizar novamente", operations: [{ type: "replace_text", find: "Cliente Novo", replace: "Cliente Final" }] });
    expect(next.version).toBe(2); expect(service.listVersions(document.id)).toHaveLength(2); expect(service.search(document.id, "Final")[0].text).toContain("Cliente Final");
  });
  it("fills content controls and table cells", () => {
    const zip = new AdmZip(); zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="w"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Valor antigo</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sdt><w:sdtPr><w:tag w:val="cliente"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Antigo</w:t></w:r></w:p></w:sdtContent></w:sdt></w:body></w:document>'));
    const result = applyDocxEdit(zip.toBuffer(), { documentId:"11111111-1111-4111-8111-111111111111", rationale:"Preencher campos", operations:[{type:"set_table_cell",table:0,row:0,column:0,text:"R$ 12.000"},{type:"fill_content_control",tag:"cliente",text:"João Silva"}] });
    const output = new AdmZip(result.output).readAsText("word/document.xml"); expect(output).toContain("R$ 12.000"); expect(output).toContain("João Silva");
  });
  it("preserves run formatting when replacement stays inside one text node", () => {
    const zip = new AdmZip(); zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="w"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Cliente Antigo</w:t></w:r></w:p></w:body></w:document>'));
    const result = applyDocxEdit(zip.toBuffer(), { documentId:"11111111-1111-4111-8111-111111111111", rationale:"Atualizar cliente", operations:[{type:"replace_text",find:"Antigo",replace:"Novo"}] });
    const output = new AdmZip(result.output).readAsText("word/document.xml"); expect(output).toContain("<w:b/>"); expect(output).toContain("Cliente Novo");
  });
  it("inherits the first run style when replacing a paragraph or a table cell", () => {
    const zip = new AdmZip(); zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Antigo</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Valor</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'));
    const result = applyDocxEdit(zip.toBuffer(), { documentId:"11111111-1111-4111-8111-111111111111", rationale:"Preservar estilo", operations:[{type:"replace_paragraph",locator:{paragraph:0},text:"Novo título"},{type:"set_table_cell",table:0,row:0,column:0,text:"R$ 12.000"}] });
    const output = new AdmZip(result.output).readAsText("word/document.xml"); expect(output).toContain('<w:pStyle w:val="Title"/>'); expect(output).toContain("<w:i/>"); expect(output).toContain("<w:b/>"); expect(output).toContain("Novo título"); expect(output).toContain("R$ 12.000");
  });
  it("handles paragraph insertion, replacement and deletion at document boundaries", () => {
    const zip=new AdmZip();zip.addFile("word/document.xml",Buffer.from('<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Primeiro</w:t></w:r></w:p><w:p><w:r><w:t>Último</w:t></w:r></w:p><w:sectPr w:rsidR="abc"></w:sectPr></w:body></w:document>'));
    const result=applyDocxEdit(zip.toBuffer(),{documentId:"11111111-1111-4111-8111-111111111111",rationale:"Ajustar parágrafos",operations:[{type:"insert_before",locator:{paragraph:0},text:"Antes"},{type:"insert_after",locator:{paragraph:0},text:"Depois"},{type:"replace_paragraph",locator:{paragraph:3},text:"Final"},{type:"delete_paragraph",locator:{paragraph:1}}]});
    const xml=new AdmZip(result.output).readAsText("word/document.xml");expect(xml).toContain("Antes");expect(xml).not.toContain("Depois");expect(xml).toContain("Primeiro");expect(xml).toContain("Final");expect(xml).not.toContain("Último");expect(xml).toContain('<w:sectPr w:rsidR="abc">');
  });
  it("applies a safely escaped paragraph style to inserted text", () => {
    const zip=new AdmZip();zip.addFile("word/document.xml",Buffer.from('<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Base</w:t></w:r></w:p></w:body></w:document>'));
    const result=applyDocxEdit(zip.toBuffer(),{documentId:"11111111-1111-4111-8111-111111111111",rationale:"Inserir título",operations:[{type:"insert_before",locator:{paragraph:0},text:"Título",style:'Heading "1"'}]});
    const xml=new AdmZip(result.output).readAsText("word/document.xml");expect(xml).toContain('<w:pStyle w:val="Heading &quot;1&quot;"/>');expect(xml).toContain("Título");
  });
});
