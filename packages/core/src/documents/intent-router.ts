export type DocumentIntent = "summarize" | "question" | "compare" | "extract" | "edit" | "general";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyDocumentIntent(userText: string, documentCount: number): DocumentIntent {
  const text = normalize(userText);

  if (documentCount >= 2 && /\b(compare|comparar|comparacao|diferenca|diferencas|mudanca|mudancas)\b|\bo que mudou\b/.test(text)) {
    return "compare";
  }

  if (/\b(resuma|resumir|resumo|sintetize|sintetizar)\b|\b(principais pontos|pontos principais)\b/.test(text)) {
    return "summarize";
  }

  if (/\b(edite|editar|altere|alterar|reescreva|reescrever|substitua|substituir|corrija|corrigir|remova|remover|adicione|adicionar|inclua|incluir)\b/.test(text)) {
    return "edit";
  }

  if (/\b(extraia|extrair|liste|listar|identifique|identificar|capture|capturar)\b/.test(text)) {
    return "extract";
  }

  if (
    /\?$/.test(text) ||
    /^(qual|quais|quando|quanto|quantos|quanta|quantas|onde|quem|como|por que|porque|o que|oque)\b/.test(text) ||
    /\b(o documento diz|o arquivo diz|existe alguma clausula|existe uma clausula|clausula|contrato|documento|arquivo|anexo|pdf)\b/.test(text)
  ) {
    return "question";
  }

  // With an explicit document context, treating unknown requests as questions is
  // safer than falling back to the general agent or interpreting document text
  // as an executable instruction.
  return documentCount > 0 ? "question" : "general";
}

export class DocumentIntentRouter {
  classify(userText: string, documentCount: number) {
    return classifyDocumentIntent(userText, documentCount);
  }
}
