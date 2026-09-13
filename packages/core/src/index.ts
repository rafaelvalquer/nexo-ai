import type { NexoSettings, OAuthConfiguration } from "@nexo/shared";
import { NexoDatabase } from "./database/db.js";
import { AuditService } from "./audit/audit.js";
import { ApprovalService } from "./permissions/approvals.js";
import { PermissionEngine } from "./permissions/policy.js";
import { ToolRegistry } from "./tools/registry.js";
import { OllamaProvider } from "./llm/ollama.js";
import { AgentPlanner } from "./agent/planner.js";
import { AgentEngine } from "./agent/engine.js";
import { MemoryRepository, MemoryService } from "./memory/index.js";
import { AutomationEngine } from "./automation/engine.js";
import { defaultAllowedRoots, defaultDataDir } from "./shared/paths.js";
import { startCoreServer } from "./server/server.js";
import { createLogger } from "./shared/logger.js";
import { BackgroundTaskService } from "./tasks/background.js";
import { ChatHistoryService } from "./chat/history.js";
import { ConnectionService } from "./connections/service.js";
import { DocumentService } from "./documents/service.js";
import { MemorySecretStore, type OAuthHost, type SecretStore } from "./connections/types.js";
import { EmailService } from "./email/service.js";
import { CalendarService } from "./calendar/service.js";
import { environment } from "./config/environment.js";
import { ConversationContextBuilder } from "./agent/context/conversation-context.js";
import { AgentRuntime } from "./agent/runtime/runtime.js";
import { EmbeddingProvider } from "./rag/embeddings.js";
import { SecurityPolicyService } from "./security/policy.js";
import { LocalMetricsService } from "./observability/metrics.js";
import { RetentionService } from "./privacy/retention.js";
import { VisualEventBus, VisualRunRepository, VisualStreamingGate, VisualTaskReporter, visualMetadataForTool } from "./agent/visual-events/index.js";

export type NexoCoreOptions = { dataDir?: string; secretStore?: SecretStore; oauthHost?: OAuthHost };

export class NexoCore {
  db: NexoDatabase;
  audit!: AuditService;
  approvals!: ApprovalService;
  permissions!: PermissionEngine;
  tools!: ToolRegistry;
  llm!: OllamaProvider;
  planner!: AgentPlanner;
  agent!: AgentEngine;
  agentRuntime!: AgentRuntime;
  security!: SecurityPolicyService;
  metrics!: LocalMetricsService;
  retention!: RetentionService;
  memory!: MemoryService;
  automation!: AutomationEngine;
  tasks!: BackgroundTaskService;
  chatHistory!: ChatHistoryService;
  conversationContext = new ConversationContextBuilder();
  visualEvents!: VisualEventBus;
  connections!: ConnectionService;
  documents!: DocumentService;
  email!: EmailService;
  calendar!: CalendarService;
  private settings!: NexoSettings;
  private chatControllers = new Map<string, AbortController>();
  private ollamaOnline?: boolean;
  private ollamaHealthTimer?: ReturnType<typeof setInterval>;
  readonly logger: ReturnType<typeof createLogger>;
  private readyPromise: Promise<void>;

  private readonly dataDir: string;
  private readonly secretStore: SecretStore;
  private readonly oauthHost?: OAuthHost;
  constructor(options: string | NexoCoreOptions = {}) {
    const dataDir = typeof options === "string" ? options : options.dataDir ?? defaultDataDir();
    this.dataDir = dataDir;
    this.secretStore = typeof options === "string" ? new MemorySecretStore() : options.secretStore ?? new MemorySecretStore();
    this.oauthHost = typeof options === "string" ? undefined : options.oauthHost;
    this.logger = createLogger(dataDir);
    this.db = new NexoDatabase(dataDir);
    this.readyPromise = this.init();
  }

  private async init() {
    await this.db.ready();
    this.metrics = new LocalMetricsService(this.db);
    this.visualEvents = new VisualEventBus(new VisualRunRepository(this.db));
    this.visualEvents.subscribe(()=>this.metrics.record("pixel_office.events_total",1));
    this.settings = this.loadSettings();
    this.audit = new AuditService(this.db, () => this.settings.privateMode);
    this.approvals = new ApprovalService(this.db);
    this.permissions = new PermissionEngine(() => this.settings);
    this.security = new SecurityPolicyService(() => this.settings);
    this.connections = new ConnectionService(this.db, this.secretStore, this.oauthHost, () => this.settings.oauth, () => this.settings.connectionsEnabled && !this.settings.privateMode);
    this.documents = new DocumentService(this.db, this.dataDir, this.settings.documentMaxSizeMb, new EmbeddingProvider(this.settings.ollamaUrl, this.settings.embeddingModel));
    this.retention = new RetentionService(this.db, this.documents);
    this.retention.purge(this.settings.dataRetentionDays);
    this.email = new EmailService(this.connections);
    this.calendar = new CalendarService(this.connections);

    const memoryRepo = new MemoryRepository(this.db);
    this.memory = new MemoryService(
      memoryRepo,
      () => this.settings.memoryEnabled && !this.settings.privateMode
    );

    this.tools = new ToolRegistry(this.memory, this.email, this.calendar);
    this.llm = new OllamaProvider(this.settings.ollamaUrl, this.settings.model);
    this.planner = new AgentPlanner(this.llm, this.tools);
    this.agentRuntime = new AgentRuntime(this.db);
    this.agent = new AgentEngine(this.planner, this.tools, this.permissions, this.approvals, this.audit, this.connections, this.agentRuntime, this.security, this.metrics);
    this.tasks = new BackgroundTaskService(this.db, () => this.settings.privateMode);
    this.tasks.subscribe(event=>this.metrics.record("assistant.ipc_events",1,{kind:event.kind}));
    this.tasks.recoverInterruptedTasks();
    this.chatHistory = new ChatHistoryService(this.db);
    this.automation = new AutomationEngine(this.db, command => this.runAutomationCommand(command));
    if (!this.settings.privateMode) this.automation.start();
    void this.checkOllamaHealth();
    this.ollamaHealthTimer=setInterval(()=>void this.checkOllamaHealth(),45000);this.ollamaHealthTimer.unref?.();
    this.logger.info({ model: this.settings.model }, "Nexo Core initialized");
  }

  async ready() {
    await this.readyPromise;
  }

  private defaultSettings(): NexoSettings {
    const env = environment();
    return {
      model: env.model,
      ollamaUrl: env.ollamaUrl,
      autonomy: "balanced",
      allowedRoots: defaultAllowedRoots(),
      privateMode: false,
      runInBackground: true,
      memoryEnabled: true,
      memoryAskBeforeSave: true,
      embeddingModel: env.embeddingModel,
      documentMaxSizeMb: env.documentMaxSizeMb,
      externalDataRetention: "local",
      connectionsEnabled: true,
      browserAutomationEnabled: true,
      fileWritesEnabled: true,
      requireApprovalForEmail: false,
      allowedDomains: [],
      dataRetentionDays: 30,
      onboardingCompleted: false,
      ocrEnabled: false,
      oauth: {
        googleClientId: "",
        microsoftClientId: "",
        microsoftTenant: env.microsoftTenant
      }
    };
  }

  private loadSettings(): NexoSettings {
    const defaults = this.defaultSettings();
    const saved = this.db.get<any>("SELECT value FROM settings WHERE key='app'");

    if (saved) {
      try {
        const parsed = JSON.parse(saved.value) as Partial<NexoSettings>;
        const migrated = { ...defaults, ...parsed };
        this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)", [JSON.stringify(migrated)]);
        return migrated;
      } catch {
        // Recria as configurações abaixo.
      }
    }

    this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)", [JSON.stringify(defaults)]);
    return defaults;
  }

  getSettings() {
    return structuredClone(this.settings);
  }

  updateSettings(patch: Partial<NexoSettings>) {
    const wasPrivate = this.settings.privateMode;
    this.settings = { ...this.settings, ...patch };
    this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)", [JSON.stringify(this.settings)]);
    this.llm.setModel(this.settings.model);
    this.llm.setBaseUrl(this.settings.ollamaUrl);
    if (patch.dataRetentionDays !== undefined) this.retention.purge(this.settings.dataRetentionDays);

    if (!wasPrivate && this.settings.privateMode) this.automation.stop();
    if (wasPrivate && !this.settings.privateMode) this.automation.start();
    return this.getSettings();
  }

  async chat(text: string) {
    await this.ready();
    return this.agent.run(text);
  }

  async startChatTask(text: string, attachmentIds: string[] = []) {
    await this.ready();
    const clean = text.trim();
    if (!clean) throw new Error("A mensagem não pode estar vazia.");
    const attachments = attachmentIds.map(id => this.documents.get(id)).filter(Boolean);
    if (attachmentIds.length !== attachments.length) throw new Error("Um ou mais anexos não estão disponíveis.");
    if (attachments.some(document => document!.status !== "ready")) throw new Error("Aguarde a indexação dos documentos antes de perguntar sobre eles.");
    const task = this.tasks.create("assistant-chat", { text: clean, attachmentIds });
    this.visualEvents.emit({runId:task.id,type:"run.created",state:"interpreting",label:"Entendendo pedido",stationId:"central-desk",severity:"info"});
    const context = !this.settings.privateMode ? this.conversationContext.build(this.chatHistory.list()) : [];
    if (!this.settings.privateMode) this.chatHistory.add("user", clean, task.id);
    void this.executeChatTask(task.id, clean, attachmentIds, context);
    return task;
  }

  private async executeChatTask(taskId: string, text: string, attachmentIds: string[] = [], context: import("./llm/provider.js").LLMMessage[] = []) {
    const controller = new AbortController();
    const responseStreaming=new VisualStreamingGate();
    let tokensReceived=0;
    this.chatControllers.set(taskId, controller);
    this.tasks.markRunning(taskId);
    try {
      const reply = attachmentIds.length
        ? { text: attachmentIds.length === 2 && /\b(compare|comparar|diferen[cç]|difere)\b/i.test(text) ? formatDocumentComparison(this.documents.compare(attachmentIds)) : (await this.documents.answer(attachmentIds, text)).text }
        : await this.agent.run(text, {
        visualContext:{visualRunId:taskId,taskId},
        onStatus: message => { this.tasks.setStatus(taskId, message); const planning=/plano|classific/i.test(message); this.visualEvents.emit({runId:taskId,type:planning?"run.planning":"tool.progress",state:planning?"planning":"executing-tool",label:message,stationId:"central-desk",severity:"info"}); },
        onToken: token => { tokensReceived+=1;this.tasks.appendProgress(taskId, token); if(responseStreaming.start())this.visualEvents.emit({runId:taskId,type:"response.streaming",state:"responding",label:"Gerando resposta",stationId:"central-desk",severity:"info",taskId}); },
        onReplaceText: output => this.tasks.replaceProgress(taskId, output),
        signal: controller.signal,
        onToolStarted:(toolName,label)=>{const visual=visualMetadataForTool(toolName);this.visualEvents.emit({runId:taskId,type:"tool.started",state:"walking",label:visual.activityLabel||label,toolName,stationId:visual.stationId,severity:"info"});},
        onToolCompleted:(toolName,ok)=>{const visual=visualMetadataForTool(toolName);this.visualEvents.emit({runId:taskId,type:"tool.completed",state:ok?"success":"error",label:ok?"Etapa concluída":"Falha na etapa",toolName,stationId:visual.stationId,severity:ok?"success":"error"});},
        onApprovalRequested:(approvalId,toolName)=>this.visualEvents.emit({runId:taskId,type:"approval.requested",state:"awaiting-approval",label:"Esperando aprovação",toolName,stationId:"approval-gate",approvalId,severity:"warning",taskId})
      }, context);

      if (controller.signal.aborted) return;

      if (!this.settings.privateMode) {
        const suffix = reply.approvalId ? " Abra Aprovações para autorizar." : "";
        this.chatHistory.add("assistant", reply.text + suffix, taskId);
      }
      if (reply.approvalId) { this.approvals.linkVisualContext(reply.approvalId,{visualRunId:taskId,taskId}); this.tasks.markWaitingApproval(taskId,reply.approvalId); return; }
      this.tasks.complete(taskId, reply);
      this.visualEvents.emit({runId:taskId,type:"run.completed",state:"success",label:"Concluído",stationId:"central-desk",severity:"success"});
    } catch (error) {
      if (controller.signal.aborted) return;
      this.tasks.fail(taskId, error);
      this.visualEvents.emit({runId:taskId,type:"run.failed",state:"error",label:"Precisa de atenção",stationId:"central-desk",severity:"error"});
      if (!this.settings.privateMode) {
        const message = error instanceof Error ? error.message : String(error);
        this.chatHistory.add("assistant", `Falha ao processar: ${message}`, taskId);
      }
    } finally {
      this.metrics.record("assistant.tokens_received",tokensReceived,{taskType:"assistant-chat"});
      this.chatControllers.delete(taskId);
    }
  }

  async cancelTask(id: string) {
    await this.ready();
    const task = this.tasks.get(id);
    if (!task || task.type !== "assistant-chat") return false;
    this.chatControllers.get(id)?.abort(new DOMException("Cancelada pelo usuário.", "AbortError"));
    const cancelled=this.tasks.cancel(id);if(cancelled)this.visualEvents.emit({runId:id,type:"run.cancelled",state:"cancelled",label:"Cancelado pelo usuário",stationId:"central-desk",severity:"warning"});return cancelled;
  }

  getOAuthConfiguration() {
    const oauth = this.settings.oauth;
    const env = environment();
    return {
      ...oauth,
      googleConfigured: Boolean(oauth.googleClientId.trim() || env.googleClientId),
      microsoftConfigured: Boolean(oauth.microsoftClientId.trim() || env.microsoftClientId)
    };
  }

  updateOAuthConfiguration(configuration: OAuthConfiguration) {
    const next: OAuthConfiguration = {
      googleClientId: configuration.googleClientId.trim(),
      microsoftClientId: configuration.microsoftClientId.trim(),
      microsoftTenant: configuration.microsoftTenant.trim() || "common"
    };
    this.updateSettings({ oauth: next });
    return this.getOAuthConfiguration();
  }

  async startDocumentImport(sourcePath: string) {
    await this.ready();
    if (this.settings.privateMode) throw new Error("A importação de documentos fica desativada no modo privado para evitar retenção de conteúdo.");
    const task = this.tasks.create("document-import", { source: "trusted-picker" });
    const visual=new VisualTaskReporter(this.visualEvents,{runId:task.id,taskId:task.id,stationId:"document-station"});visual.start("Importando documento","document-station");
    void (async () => { this.tasks.markRunning(task.id); this.tasks.setStatus(task.id, "Copiando e extraindo documento…");visual.progress("Copiando e extraindo documento…","document-station");try { const document = await this.documents.importFromTrustedPicker(sourcePath); this.tasks.setStatus(task.id, "Documento indexado.");this.tasks.complete(task.id, document);visual.complete("Documento indexado"); } catch (error) { this.tasks.fail(task.id, error);visual.fail("Falha ao importar documento"); } })();
    return task;
  }

  async editDocument(documentId: string, plan: unknown) {
    await this.ready();
    const task = this.tasks.create("document-edit", { documentId });
    const visual=new VisualTaskReporter(this.visualEvents,{runId:task.id,taskId:task.id,stationId:"document-station"});visual.start("Editando documento","document-station");
    void (async () => { this.tasks.markRunning(task.id); this.tasks.setStatus(task.id, "Aplicando alterações propostas em nova versão…");visual.progress("Aplicando alterações…","document-station");try { const result = await this.documents.applyEdit(documentId, plan);this.tasks.complete(task.id, result);visual.complete("Documento atualizado"); } catch (error) { this.tasks.fail(task.id, error);visual.fail("Falha ao editar documento"); } })();
    return task;
  }

  async previewDocument(documentId: string) { await this.ready(); return this.documents.trustedPath(documentId); }
  async documentPreviewData(documentId: string) { await this.ready(); return this.documents.previewData(documentId); }
  async exportDocument(documentId: string, destination: string) { await this.ready(); return this.documents.export(documentId, destination); }

  async listChatMessages() {
    await this.ready();
    return this.chatHistory.list();
  }

  async listTasks(limit = 50) {
    await this.ready();
    return this.tasks.list(limit);
  }

  async listActiveTasks() {
    await this.ready();
    return this.tasks.listActive();
  }

  async getTask(id: string) {
    await this.ready();
    return this.tasks.get(id);
  }

  addMemory(key: string, value: string, category?: string) {
    return this.memory.save(key, value, category);
  }

  clearMemory() {
    this.memory.clear();
    this.audit.record("memory_clear", "SENSITIVE", "success", {});
    return { ok: true };
  }

  async approve(id: string, approved: boolean) {
    await this.ready();
    const row = this.approvals.resolve(id, approved);
    if (!row) return { text: "Aprovação não encontrada." };
    const taskId=row.task_id as string|undefined;
    const runId=row.visual_run_id??taskId??row.agent_run_id??id;
    if (!approved) {
      if (row.checkpoint_id) this.agentRuntime.cancelCheckpoint(row.checkpoint_id);
      if(taskId)this.tasks.cancel(taskId);
      this.visualEvents.emit({runId,type:"approval.resolved",state:"cancelled",label:"Aprovação rejeitada",stationId:"approval-gate",approvalId:id,severity:"warning",taskId});
      this.visualEvents.emit({runId,type:"run.cancelled",state:"cancelled",label:"Cancelado após rejeição",stationId:"approval-gate",approvalId:id,severity:"warning",taskId});
      return { text: "Ação cancelada." };
    }
    this.visualEvents.emit({runId,type:"approval.resolved",state:"walking",label:"Aprovação concedida",stationId:visualMetadataForTool(row.tool_name).stationId,approvalId:id,severity:"success",taskId});
    if (row.checkpoint_id) {
      const controller=new AbortController(); if(taskId){this.chatControllers.set(taskId,controller);this.tasks.markRunning(taskId);}
      const hooks=taskId?{visualContext:{visualRunId:runId,taskId},signal:controller.signal,onStatus:(message:string)=>this.tasks.setStatus(taskId,message),onReplaceText:(text:string)=>this.tasks.replaceProgress(taskId,text),onToolStarted:(toolName:string,label:string)=>{const visual=visualMetadataForTool(toolName);this.visualEvents.emit({runId,type:"tool.started",state:"walking",label:visual.activityLabel||label,toolName,stationId:visual.stationId,severity:"info",taskId});},onToolCompleted:(toolName:string,ok:boolean)=>{const visual=visualMetadataForTool(toolName);this.visualEvents.emit({runId,type:"tool.completed",state:ok?"success":"error",label:ok?"Etapa concluída":"Falha na etapa",toolName,stationId:visual.stationId,severity:ok?"success":"error",taskId});},onApprovalRequested:(approvalId:string,toolName:string)=>this.visualEvents.emit({runId,type:"approval.requested",state:"awaiting-approval",label:"Esperando aprovação",toolName,stationId:"approval-gate",approvalId,severity:"warning",taskId})}:{};
      try{const reply=await this.agent.resumeApproval(row.checkpoint_id,hooks);if(taskId){if(reply.approvalId){this.approvals.linkVisualContext(reply.approvalId,{visualRunId:runId,taskId});this.tasks.markWaitingApproval(taskId,reply.approvalId);}else if(!controller.signal.aborted){this.tasks.complete(taskId,reply);this.visualEvents.emit({runId,type:"run.completed",state:"success",label:"Concluído",stationId:"central-desk",severity:"success",taskId});}}return reply;}finally{if(taskId)this.chatControllers.delete(taskId);}
    }
    return this.agent.execute(row.tool_name, JSON.parse(row.input_json));
  }

  async status() {
    await this.ready();
    return {
      llm: await this.llm.health(),
      models: await this.llm.models(),
      settings: this.getSettings(),
      tools: this.tools.list(),
      metrics: this.metrics.snapshot()
    };
  }

  private async checkOllamaHealth(){const health=await this.llm.health().catch(()=>({ok:false,detail:"Ollama indisponível"}));if(this.ollamaOnline===health.ok)return;this.ollamaOnline=health.ok;this.visualEvents.emit({runId:"agent-health",type:health.ok?"agent.online":"agent.offline",state:health.ok?"idle":"offline",label:health.ok?"Ollama conectado":"Ollama offline",stationId:health.ok?"central-desk":"rest-area",severity:health.ok?"success":"error"});}

  private async runAutomationCommand(command:string){
    const task=this.tasks.create("automation-run",{source:"automation"});
    const visual=new VisualTaskReporter(this.visualEvents,{runId:task.id,taskId:task.id,stationId:"central-desk"});
    this.tasks.markRunning(task.id);visual.start("Executando automação");
    try{
      const reply=await this.agent.run(command,{
        visualContext:{visualRunId:task.id,taskId:task.id},
        onStatus:message=>{this.tasks.setStatus(task.id,message);visual.progress(message);},
        onToken:token=>this.tasks.appendProgress(task.id,token),
        onReplaceText:text=>this.tasks.replaceProgress(task.id,text),
        onToolStarted:(toolName,label)=>{const metadata=visualMetadataForTool(toolName);visual.toolStarted(toolName,metadata.activityLabel||label,metadata.stationId);},
        onToolCompleted:(toolName,ok)=>{const metadata=visualMetadataForTool(toolName);visual.toolCompleted(toolName,ok,metadata.stationId);},
        onApprovalRequested:(approvalId,toolName)=>visual.waitingApproval(approvalId,toolName)
      });
      if(reply.approvalId){this.approvals.linkVisualContext(reply.approvalId,{visualRunId:task.id,taskId:task.id});this.tasks.markWaitingApproval(task.id,reply.approvalId);}else{this.tasks.complete(task.id,reply);visual.complete("Automação concluída");}
      return reply;
    }catch(error){this.tasks.fail(task.id,error);visual.fail("Falha na automação");throw error;}
  }

  backup() {
    return this.db.backup();
  }

  shutdown() {
    if(this.ollamaHealthTimer)clearInterval(this.ollamaHealthTimer);
    this.automation.stop();
    this.logger.info("Nexo Core stopped");
  }
}

export { startCoreServer } from "./server/server.js";
export * from "./permissions/policy.js";
export * from "./connections/types.js";

function formatDocumentComparison(result: ReturnType<DocumentService["compare"]>) {
  const format = (name:string, items:{locator?:string;text:string}[]) => [`${name} — trechos exclusivos:`, ...(items.length ? items.map(item=>`• ${item.locator ?? "Trecho"}: ${item.text.slice(0,400)}`) : ["• Nenhuma diferença textual identificada nos trechos indexados."])].join("\n");
  return ["Comparação local concluída.", format(result.left.name,result.left.exclusive), format(result.right.name,result.right.exclusive), `Trechos coincidentes: ${result.sharedChunkCount}.`].join("\n\n");
}
