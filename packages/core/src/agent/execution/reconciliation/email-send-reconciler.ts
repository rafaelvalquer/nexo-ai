import type { EmailService } from "../../../email/service.js";
import type { ExecutionRecord } from "../execution-record-repository.js";
import type { MutationReconciler, ReconciliationResult } from "./reconciler.js";
import {createHash} from "node:crypto";

/** Provider send APIs do not expose a stable request key yet; ambiguity is preserved instead of guessed. */
export class EmailSendReconciler implements MutationReconciler {
  constructor(private readonly email: EmailService) {}
  supports(record: ExecutionRecord) { return record.toolName === "email_send" || record.toolName === "email_send_composed"; }
  async reconcile(record: ExecutionRecord, signal?: AbortSignal): Promise<ReconciliationResult> {
    if (signal?.aborted) throw signal.reason;
    const input = record.input as { connectionId?: string; message?: { connectionId?: string; subject?: string;bodyText?:string;to?:Array<{email:string}> }; subject?: string;bodyText?:string;to?:Array<{email:string}> };
    const connectionId = input.connectionId ?? input.message?.connectionId;
    const subject = input.subject ?? input.message?.subject;
    if (!connectionId || !subject) return { status: "still_unknown", reason: "Envio sem identificadores suficientes para reconciliação." };
    try {
      const result = await this.email.search({ connectionId, query: `in:sent subject:\"${subject.replace(/\"/g, "")}\"`, maxResults: 10 }, signal);
      const expectedTo=new Set((input.to??input.message?.to??[]).map(item=>item.email.toLowerCase())),expectedBody=hash(input.bodyText??input.message?.bodyText??""),dispatched=Date.parse(record.dispatchStartedAt??record.createdAt);const matches=[];
      for(const candidate of result.messages){const message=await this.email.getMessage(connectionId,candidate.id,signal),actualTo=new Set(message.to.map(item=>item.email.toLowerCase())),within=Math.abs(Date.parse(message.receivedAt)-dispatched)<=10*60_000;if(message.subject===subject&&sameSet(expectedTo,actualTo)&&hash(message.bodyText??"")===expectedBody&&within)matches.push(message);}
      if (matches.length === 1) return { status: "confirmed_success", result: { success:true, ok: true, summary: "Envio confirmado por destinatários, assunto, corpo e janela temporal.", data: { messageId: matches[0].id,threadId:matches[0].threadId } } };
      return { status: "still_unknown", reason: matches.length ? "Mais de um envio possui todas as evidências esperadas." : "O provedor ainda não confirmou destinatários, assunto, corpo e horário do envio." };
    } catch (error) { return { status: "still_unknown", reason: error instanceof Error ? error.message : String(error) }; }
  }
}
function hash(value:string){return createHash("sha256").update(value.replace(/\s+/g," ").trim()).digest("hex");}
function sameSet(a:Set<string>,b:Set<string>){return a.size===b.size&&[...a].every(value=>b.has(value));}
