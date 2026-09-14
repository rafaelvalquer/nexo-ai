import { CheckCircle2, CircleX, Mail } from "lucide-react";
import type { EmailComposeDraftSnapshot } from "@nexo/shared";

export function EmailComposeStatus({draft}:{draft:EmailComposeDraftSnapshot}){
  if(draft.status==="sent")return <section className="emailComposeStatus emailComposeSent" aria-label="E-mail enviado"><h3><CheckCircle2 size={18}/>E-mail enviado</h3><dl><dt>Para</dt><dd>{draft.to.join(", ")}</dd><dt>Assunto</dt><dd>{draft.subject||"Sem assunto"}</dd><dt>Enviado</dt><dd>{draft.sentAt?new Date(draft.sentAt).toLocaleString("pt-BR"):"Agora"}</dd></dl></section>;
  if(draft.status==="cancelled")return <section className="emailComposeStatus" aria-label="Envio cancelado"><h3><CircleX size={18}/>Envio cancelado</h3><p>O rascunho foi mantido no histórico e nenhum e-mail foi enviado.</p></section>;
  return <section className="emailComposeStatus"><h3><Mail size={18}/>Rascunho de e-mail</h3></section>;
}
