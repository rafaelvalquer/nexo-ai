import { z } from "zod";

export const EmailComposeSchema=z.object({
  to:z.array(z.string().email()).min(1).max(50),
  subject:z.string().max(998),
  bodyText:z.string().min(1).refine(value=>value.trim().length>0,{message:"A mensagem não pode estar vazia."})
});

export type ValidEmailCompose=z.infer<typeof EmailComposeSchema>;

export function validateEmailCompose(value:unknown):ValidEmailCompose{return EmailComposeSchema.parse(value);}
