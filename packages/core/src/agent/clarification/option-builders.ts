import type { ClarificationQuestion,ConnectionProvider } from "@nexo/shared";
import type { AgentIntent } from "../orchestrator/intent-schema.js";
import { getMailboxOptions } from "../../email/preferences/category-resolver.js";
import type { EmailMailboxPreferenceCategory } from "../../email/preferences/types.js";

export function buildEmailMailboxQuestion(provider: ConnectionProvider, selected: EmailMailboxPreferenceCategory[], mode: "initial" | "update"): ClarificationQuestion {
  return {
    id: "emailCategories",
    field: "emailCategories",
    prompt: mode === "initial" ? "Quais caixas de e-mail devo considerar?" : "Selecione as caixas usadas nas pesquisas:",
    type: "multi_choice",
    options: getMailboxOptions(provider),
    selectedOptionIds: selected,
    required: true,
    helperText: mode === "initial" ? "Essa escolha será usada nas próximas buscas e ficará salva neste dispositivo." : "A configuração atual só será alterada quando você confirmar.",
    submitLabel: mode === "initial" ? "Salvar e continuar" : "Atualizar",
  };
}

export function buildClarificationQuestion(field: string, intent: AgentIntent): ClarificationQuestion {
  if(field==="to")return{id:"to",field:"to",prompt:"Qual é o endereço de e-mail do destinatário?",type:"email",allowCustomValue:true,customPlaceholder:"nome@exemplo.com",required:true,submitLabel:"Continuar"};
  if(field==="body")return{id:"body",field:"body",prompt:"Qual mensagem você quer enviar?",type:"textarea",allowCustomValue:true,customPlaceholder:"Digite a mensagem...",required:true,submitLabel:"Continuar"};
  if (field === "folder") {
    const suggested = typeof intent.suggestedValues?.folder === "string" ? intent.suggestedValues.folder : "downloads";
    const suggestedOptionId = ["downloads", "documents", "desktop"].includes(suggested) ? suggested : "downloads";
    return {
      id: "folder",
      field: "folder",
      prompt: "Qual pasta você quer consultar?",
      type: "choice_or_text",
      options: [
        { id: "downloads", label: "Downloads", value: "downloads", icon: "download" },
        { id: "documents", label: "Documentos", value: "documents", icon: "file-text" },
        { id: "desktop", label: "Desktop", value: "desktop", icon: "monitor" },
      ],
      suggestedOptionId,
      allowCustomValue: true,
      customPlaceholder: "Digite outra pasta ou caminho completo",
      required: true,
    };
  }

  return {
    id: field,
    field,
    prompt: intent.question || `Informe ${field}.`,
    type: "text",
    allowCustomValue: true,
    required: true,
  };
}
