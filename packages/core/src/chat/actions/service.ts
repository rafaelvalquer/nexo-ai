import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ApprovalBlock, ChatActionOutcome, ChatActionRequest, ChatResourceUpdatedEvent, ResourceActionState, ResourceCollectionBlock, ResourceItem, ToolResult } from "@nexo/shared";
import type { AgentEngine, AgentReply } from "../../agent/engine.js";
import type { AgentRuntime } from "../../agent/runtime/runtime.js";
import type { ConversationService } from "../../conversations/service.js";
import type { NexoDatabase } from "../../database/db.js";
import type { ApprovalService } from "../../permissions/approvals.js";
import { fingerprintFor } from "../../permissions/approvals.js";
import type { PermissionEngine } from "../../permissions/policy.js";
import { ChatPresentationBuilder } from "../presentation/builder.js";
import { emailActions } from "../presentation/adapters/email.js";
import { ChatActionRegistry, type ActionPlan } from "./registry.js";
import { registerEmailActions } from "./email-actions.js";
import { registerFileActions } from "./file-actions.js";
import { registerCalendarActions } from "./calendar-actions.js";

const requestSchema = z.object({
  conversationId: z.string().min(1), messageId: z.string().min(1), blockId: z.string().min(1), itemId: z.string().min(1), actionId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  values: z.object({bodyText:z.string().optional(),newName:z.string().optional(),destination:z.string().optional(),query:z.string().optional(),title:z.string().optional(),start:z.string().optional(),end:z.string().optional(),location:z.string().optional(),response:z.enum(["accept","tentative","decline"]).optional()}).strict().optional(),
}).strict();
type PendingAction = {request: ChatActionRequest; plan: ActionPlan; preflightFingerprint?: string};

export class ChatActionService {
  private registry = new ChatActionRegistry();
  private builder = new ChatPresentationBuilder();
  private busy = new Set<string>();
  private listeners = new Set<(event: ChatResourceUpdatedEvent) => void>();
  constructor(private db:NexoDatabase, private conversations:ConversationService, private engine:AgentEngine, private approvals:ApprovalService, private runtime:AgentRuntime, private permissions:PermissionEngine) {
    registerEmailActions(this.registry); registerFileActions(this.registry); registerCalendarActions(this.registry);
  }
  subscribe(listener:(event:ChatResourceUpdatedEvent)=>void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  handlesApproval(id:string) { return Boolean(this.db.get("SELECT approval_id FROM chat_resource_actions WHERE approval_id=?", [id])); }

  async loadMore(conversationId:string,messageId:string,blockId:string):Promise<ResourceCollectionBlock> {
    const owner=this.db.get<{conversation_id:string}>("SELECT conversation_id FROM messages WHERE id=?",[messageId]);
    if(owner?.conversation_id!==conversationId)throw new Error("Mensagem não pertence à conversa.");
    const key=`page:${messageId}:${blockId}`;
    if(this.busy.has(key))throw new Error("Página já está sendo carregada.");
    this.busy.add(key);
    try{
      const record=this.conversations.presentationRecordForMessage(messageId),block=record?.presentation.blocks.find(block=>block.id===blockId);
      if(!record||block?.type!=="resource_collection")throw new Error("Coleção não encontrada.");
      if(!block.pagination?.hasMore)return block;
      const binding=record.bindings.find(binding=>binding.blockId===blockId&&binding.itemId==="__page__");
      if(binding?.toolName!=="email_search"||!block.pagination.cursor)throw new Error("Página sem referência válida.");
      const input={...binding.input,pageToken:block.pagination.cursor};
      const reply=await this.engine.runPlan("Carregar mais e-mails",[{tool:"email_search",input}]);
      if(!reply.result?.ok)throw new Error(reply.text);
      const projected=this.builder.fromToolResult("email_search",reply.result,input),next=projected.presentation.blocks[0];
      if(next.type!=="resource_collection")throw new Error("Página inválida.");
      // Other cards can finish an action while the provider fetch is pending.
      // Merge into the latest persisted message instead of overwriting those updates.
      const current=this.conversations.presentationRecordForMessage(messageId);
      const currentBlock=current?.presentation.blocks.find(value=>value.id===blockId);
      if(!current||currentBlock?.type!=="resource_collection")throw new Error("A coleção foi removida durante o carregamento.");
      const known=new Set(currentBlock.items.flatMap(item=>item.resource.kind==="email"?[item.resource.messageId]:[]));
      const added=next.items.filter(item=>item.resource.kind==="email"&&!known.has(item.resource.messageId));
      currentBlock.items.push(...added);currentBlock.total=next.total;currentBlock.pagination=next.pagination;
      current.bindings.push(...projected.bindings.filter(binding=>added.some(item=>item.id===binding.itemId)).map(binding=>({...binding,blockId})));
      this.conversations.savePresentation(messageId,current);return currentBlock;
    }finally{this.busy.delete(key);}
  }

  private resolve(request:ChatActionRequest, requireEnabled = true) {
    const message = this.db.get<{conversation_id:string}>("SELECT conversation_id FROM messages WHERE id=?", [request.messageId]);
    if (message?.conversation_id !== request.conversationId) throw new Error("Mensagem não pertence à conversa.");
    const record = this.conversations.presentationRecordForMessage(request.messageId);
    const block = record?.presentation.blocks.find(block => block.id === request.blockId);
    if (!record || block?.type !== "resource_collection") throw new Error("Coleção não encontrada.");
    const selectedIds = request.itemIds ?? [request.itemId];
    if (new Set(selectedIds).size !== selectedIds.length || !selectedIds.includes(request.itemId)) throw new Error("Seleção inválida.");
    if (selectedIds.length > 1 && !/^email\.(trash|archive|mark_read|mark_unread)$/.test(request.actionId)) throw new Error("Ação não permite seleção múltipla.");
    const items = selectedIds.map(id => {
      const item = block.items.find(item => item.id === id);
      if (!item) throw new Error("Recurso não encontrado.");
      if (requireEnabled && !item.actions.some(action => action.id === request.actionId && !action.disabled)) throw new Error("Ação não disponível neste recurso.");
      return item;
    });
    const item = items.find(item => item.id === request.itemId)!;
    const binding = record.bindings.find(binding => binding.blockId === block.id && binding.itemId === item.id);
    if (!binding) throw new Error("Referência interna do recurso não encontrada.");
    for (const selected of items) {
      const other = record.bindings.find(value => value.blockId === block.id && value.itemId === selected.id);
      if (!other || other.input.connectionId !== binding.input.connectionId) throw new Error("A seleção mistura contas diferentes.");
      if (selected.resource.kind === "email" && other.input.messageId !== selected.resource.messageId || selected.resource.kind === "calendar" && other.input.eventId !== selected.resource.eventId || (selected.resource.kind === "file" || selected.resource.kind === "folder") && other.input.path !== selected.resource.path) throw new Error("A referência do recurso foi alterada.");
    }
    return {record, block, item, items, binding};
  }

  private update(request:ChatActionRequest, state:ResourceActionState, text:string, approval?:ApprovalBlock, transform?:(item:ResourceItem)=>void) {
    const {record, items} = this.resolve(request, false);
    for (const item of items) {
      item.state=state; item.statusText=text; item.pendingApprovalId=approval?.status === "pending" ? approval.approvalId : undefined; transform?.(item);
      if(item.resource.kind === "file" || item.resource.kind === "folder"){
        const binding=record.bindings.find(binding=>binding.blockId===request.blockId&&binding.itemId===item.id);
        if(binding)binding.input.path=item.resource.path;
      }
    }
    if (approval) {
      const index = record.presentation.blocks.findIndex(block => block.type === "approval" && block.approvalId === approval.approvalId);
      if (index < 0) record.presentation.blocks.push(approval); else record.presentation.blocks[index]=approval;
    }
    this.conversations.savePresentation(request.messageId,record);
    for (const item of items) for (const listener of this.listeners) listener({type:"chat.resource.updated",conversationId:request.conversationId,messageId:request.messageId,blockId:request.blockId,itemId:item.id,state:item.state ?? state,item,approval});
    return items.find(item => item.id === request.itemId)!;
  }
  private approvalBlock(id:string):ApprovalBlock {
    const approval=this.approvals.list("all").find(value=>value.id===id);
    if (!approval) throw new Error("Aprovação não encontrada.");
    return {id:`approval:${id}`,version:1,type:"approval",approvalId:id,title:approval.reason,preview:approval.preview,consequence:approval.consequence,affectedCount:approval.affectedCount,expiresAt:approval.expiresAt,status:approval.status};
  }

  async execute(raw:unknown):Promise<ChatActionOutcome> {
    const request=requestSchema.parse(raw);
    const resolved=this.resolve(request);
    for(const item of resolved.items)if(item.pendingApprovalId){
      const approval=this.approvals.list("all").find(approval=>approval.id===item.pendingApprovalId);
      if(approval&&approval.status!=="pending"){
        item.pendingApprovalId=undefined;
        this.update({...request,itemId:item.id,itemIds:undefined},"idle",approval.status==="expired"?"A prévia expirou. Preparando nova ação…":"");
      }
    }
    if (resolved.items.some(item=>this.busy.has(item.id)||item.pendingApprovalId)) throw new Error("Já existe uma ação pendente para este recurso.");
    for (const item of resolved.items) this.busy.add(item.id);
    try {
      this.update(request,"preparing","Preparando ação…");
      const resource=resolved.item.resource;
      if (resource.kind === "file" || resource.kind === "folder") {
        this.permissions.assertPath(resource.path);
        this.permissions.assertPath(await fs.realpath(resource.path));
        if (request.actionId === "file.copy_path" || request.actionId === "file.open_folder" || request.actionId === "file.open") {
          const item=this.update(request,"idle","");
          return {item,...(request.actionId === "file.copy_path" ? {copyText:resource.path} : {openPath:request.actionId === "file.open" || resource.kind === "folder" ? resource.path : path.dirname(resource.path)})};
        }
        if (request.actionId === "file.preview" && !/\.(txt|md|csv|json|log)$/i.test(resource.path)) {
          const info=await this.engine.runPlan("Verificar arquivo",[{tool:"file_info",input:{path:resource.path}}]);
          if (!info.result?.ok) throw new Error(info.text);
          const ext=path.extname(resource.path).toLowerCase(), mime=({".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp",".pdf":"application/pdf"} as Record<string,string>)[ext];
          if (!mime) return {item:this.update(request,"idle",""),openPath:resource.path};
          const stat=await fs.stat(resource.path);
          if (stat.size>20*1024*1024) return {item:this.update(request,"idle",""),openPath:resource.path};
          const bytes=await fs.readFile(resource.path);
          return {item:this.update(request,"idle",""),preview:{kind:ext === ".pdf"?"pdf":"image",content:`data:${mime};base64,${bytes.toString("base64")}`}};
        }
      }
      if (request.actionId === "calendar.join" && resource.kind === "calendar") {
        const fresh=await this.engine.runPlan("Verificar reunião",[{tool:"calendar_get",input:{connectionId:resolved.binding.input.connectionId,eventId:resource.eventId}}]);
        if (!fresh.result?.ok) throw new Error(fresh.text);
        const url=z.object({meetingUrl:z.string().url()}).parse(fresh.result.data).meetingUrl;
        if (!/^https?:\/\//i.test(url)) throw new Error("Link da reunião não permitido.");
        return {item:this.update(request,"idle",""),openUrl:url};
      }
      const plan=this.registry.resolve(request.actionId)({request,...resolved});
      await this.validateFilePlan(plan);
      let preflightFingerprint:string|undefined;
      if (plan.preflight) {
        const preflight=await this.engine.runPlan("Verificar recurso selecionado",[plan.preflight]);
        if (!preflight.result?.ok || preflight.approvalId) throw new Error(preflight.text);
        preflightFingerprint=fingerprintFor("resource",{data:preflight.result.data});
      }
      const results:{tool:string;input:Record<string,unknown>;result:ToolResult}[]=[];
      const reply=await this.engine.runPlan("Ação em recurso selecionado",plan.steps,{visualContext:{visualRunId:request.messageId,conversationId:request.conversationId},onToolResult:(tool,input,result)=>results.push({tool,input,result}),onToolStarted:()=>this.update(request,"executing","Processando…")});
      if (reply.approvalId) {
        const pending:PendingAction={request,plan,preflightFingerprint};
        this.db.run("INSERT INTO chat_resource_actions(approval_id,message_id,payload_json) VALUES(?,?,?)",[reply.approvalId,request.messageId,JSON.stringify(pending)]);
        const approval=this.approvalBlock(reply.approvalId);
        return {item:this.update(request,"awaiting_approval","Aguardando confirmação",approval),approval};
      }
      if (!reply.result?.ok && !reply.results?.every(result=>result.ok)) throw new Error(reply.text);
      if (!reply.result && !reply.results?.length) throw new Error(reply.text);
      if (plan.mode === "expand") {
        const message=results.find(result=>result.tool === "email_get");
        const projection=message && this.builder.fromToolResult(message.tool,message.result,message.input).presentation.blocks[0];
        const attachments=results.find(result=>result.tool === "email_list_attachments")?.result.data;
        return {item:this.update(request,"idle","",undefined,item=>{
          if (projection?.type === "resource_collection" && projection.items[0]?.resource.kind === "email" && item.resource.kind === "email") item.resource={...projection.items[0].resource,attachments:z.array(z.object({id:z.string(),name:z.string(),contentType:z.string().optional(),size:z.number().optional()})).parse(attachments??[])};
        })};
      }
      if (plan.mode === "preview") return {item:this.update(request,"idle",""),preview:{kind:"text",content:String(reply.result?.data??"")}};
      if (plan.mode === "list") {
        const result=results[0],projected=this.builder.fromToolResult(result.tool,result.result,result.input),block=projected.presentation.blocks[0];
        if (block.type !== "resource_collection") throw new Error("A pasta não retornou uma lista válida.");
        const current=this.resolve(request,false).record;
        current.presentation.blocks.push(block); current.bindings.push(...projected.bindings);
        this.conversations.savePresentation(request.messageId,current);
        return {item:this.update(request,"idle",""),block};
      }
      return {item:this.finish(request,plan,reply)};
    } catch(error) {
      this.update(request,"failed",error instanceof Error?error.message:String(error)); throw error;
    } finally {for(const item of resolved.items)this.busy.delete(item.id);}
  }

  private finish(request:ChatActionRequest, plan:ActionPlan, reply:AgentReply, approval?:ApprovalBlock) {
    const failures=z.object({failures:z.array(z.object({messageId:z.string(),error:z.string()}))}).safeParse(reply.result?.data);
    const ok=reply.result?.ok ?? Boolean(reply.results?.length && reply.results.every(result=>result.ok));
    return this.update(request,ok?"success":"failed",ok?plan.successText:reply.result?.error??reply.text,approval,item=>{
      const failure=item.resource.kind === "email" && failures.success ? failures.data.failures.find(f=>f.messageId===(item.resource as any).messageId) : undefined;
      if(failure){item.state="failed";item.statusText=failure.error;return;}
      if(!ok)return;
      const input=plan.steps.at(-1)?.input;
      if((item.resource.kind === "file" || item.resource.kind === "folder") && /^file\.(rename|move)$/.test(request.actionId)){
        const destination=input?.newPath??input?.destination;
        if(typeof destination === "string"){item.resource.path=destination;item.resource.name=path.basename(destination);item.resource.extension=path.extname(destination).slice(1);}
      }
      if(item.resource.kind === "calendar" && request.actionId === "calendar.edit" && input){
        for(const key of ["title","start","end","location"] as const)if(typeof input[key] === "string")item.resource[key]=input[key];
      }
      if(item.resource.kind === "email" && /mark_(read|unread)$/.test(request.actionId)){item.resource.unread=request.actionId.endsWith("mark_unread");item.actions=emailActions(item.resource.unread);}
      if(/\.(trash|delete)$/.test(request.actionId)) item.actions=item.actions.map(action=>({...action,disabled:true}));
    });
  }

  async resolveApproval(id:string, approved:boolean):Promise<ChatActionOutcome> {
    const row=this.db.get<{payload_json:string}>("SELECT payload_json FROM chat_resource_actions WHERE approval_id=?",[id]);
    if(!row)throw new Error("Aprovação não pertence a uma ação de card.");
    const pending=JSON.parse(row.payload_json) as PendingAction;
    const approvalState=this.approvals.list("all").find(approval=>approval.id===id);
    if(approvalState?.status!=="pending")throw new Error(approvalState?.status==="expired"?"A aprovação expirou. Gere uma nova prévia.":"Esta aprovação já foi resolvida.");
    const {items}=this.resolve(pending.request,false);
    if(items.some(item=>this.busy.has(item.id)))throw new Error("A ação já está sendo processada.");
    for(const item of items)this.busy.add(item.id);
    try {
      if(approved && pending.plan.preflight){
        await this.validateFilePlan(pending.plan);
        const preflight=await this.engine.runPlan("Revalidar recurso",[pending.plan.preflight]);
        if(!preflight.result?.ok || fingerprintFor("resource",{data:preflight.result.data})!==pending.preflightFingerprint) throw new Error("O recurso mudou desde a prévia. Cancele e gere uma nova confirmação.");
      }
      const approval=this.approvals.resolve(id,approved);
      if(!approval?.checkpoint_id)throw new Error("Checkpoint da ação não encontrado.");
      const block=this.approvalBlock(id);
      if(!approved){this.runtime.cancelCheckpoint(approval.checkpoint_id);return{item:this.update(pending.request,"idle","Ação cancelada",block),approval:block};}
      this.update(pending.request,"executing","Executando ação…",block);
      const reply=await this.engine.resumeApproval(approval.checkpoint_id,{visualContext:{visualRunId:pending.request.messageId,conversationId:pending.request.conversationId}});
      return {item:this.finish(pending.request,pending.plan,reply,block),approval:block};
    } catch(error) {this.update(pending.request,"failed",error instanceof Error?error.message:String(error),this.approvalBlock(id));throw error;}
    finally {for(const item of items)this.busy.delete(item.id);}
  }

  private async validateFilePlan(plan:ActionPlan) {
    if(plan.preflight?.tool!=="file_info")return;
    const source=String(plan.preflight.input.path);
    this.permissions.assertPath(source);
    this.permissions.assertPath(await fs.realpath(source));
    for(const step of plan.steps){
      const destination=step.input.newPath??step.input.destination;
      if(typeof destination!=="string")continue;
      this.permissions.assertPath(destination);
      const existing=await fs.lstat(destination).catch(error=>{if(error?.code==="ENOENT")return undefined;throw error;});
      if(existing)throw new Error("Já existe um recurso no destino. Escolha outro nome ou pasta.");
      let ancestor=path.dirname(path.resolve(destination));
      for(;;){
        try{this.permissions.assertPath(await fs.realpath(ancestor));break;}
        catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;const parent=path.dirname(ancestor);if(parent===ancestor)throw error;ancestor=parent;}
      }
    }
  }
}
