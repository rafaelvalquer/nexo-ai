import { z } from "zod";
import type { EmailService } from "../../email/service.js";
import type { ToolDefinition } from "../types.js";
const address = z.object({ email:z.string().email(), name:z.string().optional() });
export const emailTools = (service: EmailService): ToolDefinition[] => [
  { name:"email_search", description:"Pesquisa e-mails da conta conectada", inputSchema:z.object({connectionId:z.string().uuid(),query:z.string().optional(),unread:z.boolean().optional(),maxResults:z.number().int().min(1).max(50).optional()}), risk:"READ", permissions:["email.read"], execute: async input => { const data=await service.search(input); return {ok:true,summary:`${data.length} e-mail(s) encontrado(s).`,data}; } },
  { name:"email_create_draft", description:"Prepara um rascunho de e-mail sem enviar", inputSchema:z.object({connectionId:z.string().uuid(),to:z.array(address).min(1),subject:z.string().min(1),bodyText:z.string().min(1),cc:z.array(address).optional()}), risk:"SAFE_WRITE", permissions:["email.write"], execute: async input => ({ok:true,summary:"Rascunho preparado. Revise e aprove o envio.",data:await service.createDraft(input)}) },
  { name:"email_send", description:"Envia um rascunho de e-mail aprovado", inputSchema:z.object({id:z.string().uuid(),provider:z.enum(["google","microsoft"]),message:z.object({connectionId:z.string().uuid(),to:z.array(address).min(1),subject:z.string(),bodyText:z.string(),cc:z.array(address).optional()})}), risk:"SENSITIVE", permissions:["email.send"], execute: async input => ({ok:true,summary:"E-mail enviado.",data:await service.sendDraft(input)}) }
];
