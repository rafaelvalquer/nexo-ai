import path from "node:path";
import type { ClarificationQuestion } from "@nexo/shared";
import type { PermissionEngine } from "../../permissions/policy.js";
import { resolveKnownFolderFromText } from "../../filesystem/known-folders.js";
import { resolveUserPath } from "../../filesystem/path-resolver.js";

export type ClarificationAnswerInput = {
  optionId?: string;
  customValue?: string;
  chatText?: string;
};

export type ClarificationAnswer =
  | { resolved: true; value: unknown; source: "button" | "custom_input" | "chat_text" }
  | { resolved: false; suggestedOptionId?: string; message?: string };

export class ClarificationResolver {
  constructor(private readonly permissions: PermissionEngine) {}

  resolve(question: ClarificationQuestion, input: ClarificationAnswerInput): ClarificationAnswer {
    const source = input.chatText !== undefined ? "chat_text" : input.customValue !== undefined ? "custom_input" : "button";
    const raw = (input.chatText ?? input.customValue)?.trim();

    if (input.optionId) {
      const option = question.options?.find((item) => item.id === input.optionId);
      if (!option) return { resolved: false, message: "Essa opção não está disponível." };
      return { resolved: true, value: option.value, source };
    }

    if (!raw) return { resolved: false, suggestedOptionId: question.suggestedOptionId };
    if (question.field === "folder") return this.resolveFolder(raw, source);
    return { resolved: true, value: raw, source };
  }

  private resolveFolder(raw: string, source: "button" | "custom_input" | "chat_text"): ClarificationAnswer {
    const known = resolveKnownFolderFromText(raw);
    if (known?.confidence && known.confidence >= 0.95) {
      return { resolved: true, value: known.id, source };
    }
    if (known) {
      return {
        resolved: false,
        suggestedOptionId: known.id,
        message: `Entendi que você pode estar se referindo a ${known.id === "downloads" ? "Downloads" : known.id === "documents" ? "Documentos" : "Desktop"}. Confirme para continuar.`,
      };
    }

    const custom = resolveCustomPath(raw);
    if (!custom) return { resolved: false, message: "Não consegui identificar essa pasta. Escolha uma opção ou informe um caminho completo." };
    try {
      this.permissions.assertPath(custom);
      return { resolved: true, value: custom, source };
    } catch (error) {
      return { resolved: false, message: error instanceof Error ? error.message : "Essa pasta não está entre as pastas autorizadas do Nexo." };
    }
  }
}

function resolveCustomPath(raw: string) {
  const resolved = resolveUserPath({ path: raw });
  if (resolved) return resolved;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return path.win32.normalize(raw);
  return undefined;
}
