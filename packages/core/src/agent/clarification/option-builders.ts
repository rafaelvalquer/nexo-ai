import type { ClarificationQuestion } from "@nexo/shared";
import type { AgentIntent } from "../orchestrator/intent-schema.js";

export function buildClarificationQuestion(field: string, intent: AgentIntent): ClarificationQuestion {
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
