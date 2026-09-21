import { randomUUID } from "node:crypto";
import type { ClarificationBlock,ClarificationResolution,ClarificationResolutionRequest,ConnectionProvider } from "@nexo/shared";
import type { AgentIntent } from "../orchestrator/intent-schema.js";
import { buildClarificationQuestion,buildEmailMailboxQuestion } from "./option-builders.js";
import { ClarificationRepository } from "./repository.js";
import { ClarificationResolver,type ClarificationAnswer } from "./resolver.js";
import type { ClarificationAttempt,ClarificationResume,PendingClarification } from "./types.js";
import type {StructuredClarification} from "./clarification-types.js";
import type { EmailMailboxPreferenceCategory } from "../../email/preferences/types.js";
import { normalizeRecipients } from "../../email/compose/normalizer.js";
import type {LocalMetricsService} from "../../observability/metrics.js";

const KNOWN_FOLDERS = new Set(["downloads", "documents", "desktop"]);

export class ClarificationService {
  constructor(private readonly repository: ClarificationRepository, private readonly resolver: ClarificationResolver,private readonly metrics?:LocalMetricsService) {}

  create(conversationId: string, originalRequest: string, intent: AgentIntent) {
    const missing = intent.missing?.filter(Boolean) ?? [];
    const field = missing[0];
    if (!field) throw new Error("Não há campo faltante para esclarecer.");
    const existing=(intent.entities as Record<string,unknown>)[field];
    if(existing!==undefined&&existing!==null&&existing!==""){this.metrics?.record("intent.clarification.unnecessary",1,{field,operation:intent.operation});throw new Error(`Clarification desnecessária: ${field} já está resolvido.`);}
    this.metrics?.record("intent.clarification.created",1,{field,operation:intent.operation});
    const createdAt = new Date().toISOString();
    const record: PendingClarification = {
      id: randomUUID(), conversationId, domain: normalizeDomain(intent.domain), intent: intent.intent, operation: intent.operation, originalRequest,
      partialEntities: { ...intent.entities }, questions: [buildClarificationQuestion(field, intent)], status: "pending", createdAt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), intentSnapshot: structuredClone(intent), values: {},
    };
    return this.repository.save(record);
  }

  createEmailMailboxPreference(conversationId: string,originalRequest: string,intent: AgentIntent,connectionId: string,provider: ConnectionProvider,selected: EmailMailboxPreferenceCategory[],mode: "initial" | "update") {
    const createdAt = new Date().toISOString();
    const snapshot: AgentIntent = {...structuredClone(intent),status: "needs_clarification",entities: { ...intent.entities, connectionId },missing: ["emailCategories"],question: "Quais caixas de e-mail devo considerar?"};
    const record: PendingClarification = {
      id: randomUUID(),conversationId,domain: "email",intent: intent.intent,operation: intent.operation,originalRequest,
      partialEntities: {...intent.entities,connectionId,__emailPreferenceFlow: true,__emailPreferenceMode: mode,__emailProvider: provider},
      questions: [buildEmailMailboxQuestion(provider, selected, mode)],status: "pending",createdAt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),intentSnapshot: snapshot,values: {},
    };
    return this.repository.save(record);
  }


  createStructured(conversationId:string,clarification:StructuredClarification){
    const createdAt=new Date().toISOString();
    const snapshot:AgentIntent={schemaVersion:1,status:"needs_clarification",domain:"general",intent:"read",operation:"structured_clarification",entities:{},referencesPreviousResult:false,requiresDataLookup:false,requiresConfirmation:false,confidence:1,missing:["__structuredOption"],question:clarification.question};
    const record:PendingClarification={
      id:clarification.id,conversationId,domain:"general",intent:"read",operation:"structured_clarification",originalRequest:clarification.originalRequest,
      partialEntities:{__structuredClarification:clarification},
      questions:[{id:"__structuredOption",field:"__structuredOption",prompt:clarification.question,type:"single_choice",options:clarification.options.map(option=>({id:option.id,label:option.label,value:option.id,description:option.description,icon:option.metadata?.icon,metadata:option.metadata?{path:option.metadata.path,size:option.metadata.size,modifiedAt:option.metadata.modifiedAt}:undefined})),allowCustomValue:clarification.allowFreeText,required:true,submitLabel:"Selecionar"}],
      status:"pending",createdAt,expiresAt:clarification.expiresAt,intentSnapshot:snapshot,values:{}
    };
    this.metrics?.record("intent.clarification.created",1,{field:"structured",type:clarification.type});
    return this.repository.save(record);
  }

  pending(conversationId: string) {return this.repository.pendingForConversation(conversationId);}
  get(id: string) {return this.repository.get(id);}

  block(record: PendingClarification): ClarificationBlock {
    return {id: `clarification:${record.id}`,version: 1,type: "clarification",clarificationId: record.id,title: record.questions[0]?.prompt ?? "Preciso de uma informação",questions: record.questions,state: record.status === "resolved" ? "submitted" : record.status,values: Object.keys(record.values).length ? record.values : undefined};
  }

  tryResolveText(conversationId: string, text: string): ClarificationAttempt {
    const pending = this.pending(conversationId);if (!pending) return { kind: "none" };
    if (/^\s*(cancelar|cancela|cancel)\s*$/i.test(text)) {const cancelled = this.cancel(pending.id);return { kind: "pending", pending: cancelled ?? pending, message: "Esclarecimento cancelado." };}
    const question = pending.questions[0];if (!question) return { kind: "none" };
    const answer = this.resolver.resolve(question, { chatText: text });return this.applyAnswer(pending, question.id, answer);
  }

  resolve(request: ClarificationResolutionRequest): ClarificationAttempt {
    const pending = this.repository.get(request.clarificationId);if (!pending || pending.status !== "pending") return { kind: "none" };
    const question = pending.questions.find((item) => item.id === request.questionId) ?? pending.questions[0];if (!question) return { kind: "none" };
    const answer = this.resolver.resolve(question, { optionId: request.optionId, optionIds: request.optionIds, customValue: request.customValue });return this.applyAnswer(pending, question.id, answer);
  }

  cancel(id: string) {return this.repository.cancel(id);}

  private applyAnswer(pending: PendingClarification, questionId: string, answer: ClarificationAnswer): ClarificationAttempt {
    const question = pending.questions.find((item) => item.id === questionId) ?? pending.questions[0];if (!question) return { kind: "pending", pending };
    if (!answer.resolved) {const questions = pending.questions.map((item) => item.id === question.id && answer.suggestedOptionId ? { ...item, suggestedOptionId: answer.suggestedOptionId } : item);const updated = this.repository.update({ ...pending, questions });return { kind: "pending", pending: updated, message: answer.message };}

    const values = { ...pending.values, [question.field]: answer.value };
    if(question.field==="__structuredOption"){
      const structured=pending.partialEntities.__structuredClarification as StructuredClarification|undefined;
      const selected=structured?.options.find(option=>option.id===answer.value);
      if(!structured||!selected)return{kind:"pending",pending,message:"Essa opção não está mais disponível."};
      const resolvedAt=new Date().toISOString();
      const resolved=this.repository.update({...pending,values,status:"resolved",resolvedAt});
      this.metrics?.record("intent.clarification.selected",1,{type:structured.type,option:selected.id});
      const resolution:ClarificationResolution={clarificationId:pending.id,values,source:answer.source,status:"resolved"};
      const value:ClarificationResume={pending:resolved,intent:pending.intentSnapshot,originalRequest:pending.originalRequest,resolution,selectedRoute:selected.route,selectedOptionId:selected.id};
      return{kind:"resolved",value};
    }
    const entityPatch = this.entityPatch(question.field, answer.value);
    const entities = { ...pending.partialEntities, ...entityPatch };
    const remaining = (pending.intentSnapshot.missing ?? []).filter((field) => field !== question.field && values[field] === undefined);
    const intent: AgentIntent = {...pending.intentSnapshot,entities,status: remaining.length ? "needs_clarification" : "ready",missing: remaining.length ? remaining : undefined,question: remaining.length ? pending.intentSnapshot.question : undefined};

    if (remaining.length) {
      const updated = this.repository.update({...pending,partialEntities: entities,values,intentSnapshot: intent,questions: [buildClarificationQuestion(remaining[0], intent)]});
      return { kind: "pending", pending: updated };
    }

    const resolvedAt = new Date().toISOString();
    const resolved = this.repository.update({...pending,partialEntities: entities,values,intentSnapshot: intent,questions: pending.questions,status: "resolved",resolvedAt});
    const resolution: ClarificationResolution = {clarificationId: pending.id,values,source: answer.source,status: "resolved"};
    const value: ClarificationResume = { pending: resolved, intent, originalRequest: pending.originalRequest, resolution };
    return { kind: "resolved", value };
  }

  private entityPatch(field: string, value: unknown): Record<string, unknown> {
    if(field==="fileMatch"&&typeof value==="string")return{path:value};
    if (field === "folder" && typeof value === "string" && !KNOWN_FOLDERS.has(value)) return { path: value };
    if(["to","recipient","recipients","recipientEmail","recipientEmails","email"].includes(field))return{to:normalizeRecipients(value)};
    if(["body","message","text","content"].includes(field))return{body:String(value)};
    return { [field]: value };
  }
}

function normalizeDomain(domain: AgentIntent["domain"]): PendingClarification["domain"] {return domain === "filesystem" || domain === "email" || domain === "calendar" ? domain : "general";}
