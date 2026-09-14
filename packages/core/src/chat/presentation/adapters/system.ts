import { z } from "zod";
import { genericAdapter } from "./generic.js";

const stats = z.object({ totalMessages: z.number(), totalThreads: z.number(), inboxMessages: z.number(), unreadMessages: z.number() });
export const emailStatsAdapter = genericAdapter(data => {
  const parsed = stats.safeParse(data);
  if (!parsed.success) return undefined;
  return [{ kind: "generic", title: "Sua caixa de e-mail", metadata: [
    { label: "Mensagens", value: String(parsed.data.totalMessages) },
    { label: "Conversas", value: String(parsed.data.totalThreads) },
    { label: "Caixa de entrada", value: String(parsed.data.inboxMessages) },
    { label: "Não lidas", value: String(parsed.data.unreadMessages) },
  ] }];
}, "Resumo de e-mail");
