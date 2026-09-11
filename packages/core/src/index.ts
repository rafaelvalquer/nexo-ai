import type { NexoSettings } from "@nexo/shared";
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

export class NexoCore {
  db: NexoDatabase;
  audit!: AuditService;
  approvals!: ApprovalService;
  permissions!: PermissionEngine;
  tools!: ToolRegistry;
  llm!: OllamaProvider;
  planner!: AgentPlanner;
  agent!: AgentEngine;
  memory!: MemoryService;
  automation!: AutomationEngine;
  tasks!: BackgroundTaskService;
  chatHistory!: ChatHistoryService;
  private settings!: NexoSettings;
  readonly logger: ReturnType<typeof createLogger>;
  private readyPromise: Promise<void>;

  constructor(dataDir=defaultDataDir()) { this.logger=createLogger(dataDir); this.db=new NexoDatabase(dataDir); this.readyPromise=this.init(); }

  private async init() {
    await this.db.ready();
    this.settings=this.loadSettings();
    this.audit=new AuditService(this.db);
    this.approvals=new ApprovalService(this.db);
    this.permissions=new PermissionEngine(()=>this.settings);
    const memoryRepo = new MemoryRepository(this.db);
    this.memory=new MemoryService(memoryRepo);
    this.tools=new ToolRegistry(this.memory);
    this.llm=new OllamaProvider(this.settings.ollamaUrl,this.settings.model);
    this.planner=new AgentPlanner(this.llm,this.tools);
    this.agent=new AgentEngine(this.planner,this.tools,this.permissions,this.approvals,this.audit);
    this.tasks=new BackgroundTaskService(this.db);
    this.tasks.recoverInterruptedTasks();
    this.chatHistory=new ChatHistoryService(this.db);
    this.automation=new AutomationEngine(this.db,async cmd=>this.agent.run(cmd));
    this.automation.start();
    this.logger.info({model:this.settings.model},"Nexo Core initialized");
  }

  async ready(){await this.readyPromise;}

  private loadSettings():NexoSettings {
    const saved=this.db.get<any>("SELECT value FROM settings WHERE key='app'");
    if(saved){try{return JSON.parse(saved.value);}catch{}}
    const initial:NexoSettings={model:process.env.NEXO_MODEL??"qwen3:4b",ollamaUrl:process.env.NEXO_OLLAMA_URL??"http://127.0.0.1:11434",autonomy:"balanced",allowedRoots:defaultAllowedRoots(),privateMode:false,runInBackground:true};
    this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)",[JSON.stringify(initial)]); return initial;
  }

  getSettings(){return structuredClone(this.settings);}
  updateSettings(patch:Partial<NexoSettings>){const wasPrivate=this.settings.privateMode;this.settings={...this.settings,...patch};this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)",[JSON.stringify(this.settings)]);this.llm.setModel(this.settings.model);this.llm.setBaseUrl(this.settings.ollamaUrl);if(!wasPrivate&&this.settings.privateMode)this.automation.stop();if(wasPrivate&&!this.settings.privateMode)this.automation.start();return this.getSettings();}
  async chat(text:string){await this.ready();return this.agent.run(text);}

  async startChatTask(text:string){
    await this.ready();
    const clean=text.trim();
    if(!clean) throw new Error("A mensagem não pode estar vazia.");
    const task=this.tasks.create("assistant-chat",{text:clean});
    if(!this.settings.privateMode) this.chatHistory.add("user",clean,task.id);
    void this.executeChatTask(task.id,clean);
    return task;
  }

  private async executeChatTask(taskId:string,text:string){
    this.tasks.markRunning(taskId);
    try {
      const reply=await this.agent.run(text,{
        onStatus: message => this.tasks.setStatus(taskId,message),
        onToken: token => this.tasks.appendProgress(taskId,token),
        onReplaceText: output => this.tasks.replaceProgress(taskId,output)
      });
      if(!this.settings.privateMode){
        const suffix=reply.approvalId ? " Abra Aprovações para autorizar." : "";
        this.chatHistory.add("assistant",reply.text+suffix,taskId);
      }
      this.tasks.complete(taskId,reply);
    } catch(error) {
      this.tasks.fail(taskId,error);
      if(!this.settings.privateMode){
        const message=error instanceof Error?error.message:String(error);
        this.chatHistory.add("assistant",`Falha ao processar: ${message}`,taskId);
      }
    }
  }

  async listChatMessages(){await this.ready();return this.chatHistory.list();}
  async listTasks(limit=50){await this.ready();return this.tasks.list(limit);}
  async listActiveTasks(){await this.ready();return this.tasks.listActive();}
  async getTask(id:string){await this.ready();return this.tasks.get(id);}

  addMemory(key:string, value:string, category?:string){if(this.settings.privateMode)throw new Error("Modo privado está ativo; memória não será gravada.");return this.memory.save(key,value,category);}
  async approve(id:string,approved:boolean){await this.ready();const row=this.approvals.resolve(id,approved);if(!row||!approved)return {text:"Ação cancelada."};return this.agent.execute(row.tool_name,JSON.parse(row.input_json));}
  async status(){await this.ready();return {llm:await this.llm.health(),models:await this.llm.models(),settings:this.getSettings(),tools:this.tools.list()};}
  backup(){return this.db.backup();}
  shutdown(){this.automation.stop();this.logger.info("Nexo Core stopped");}
}

export { startCoreServer } from "./server/server.js";
export * from "./permissions/policy.js";
