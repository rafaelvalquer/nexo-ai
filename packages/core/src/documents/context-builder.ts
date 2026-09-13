import type { RetrievedChunk } from "./service.js";
import { DOCUMENT_CONTEXT, truncateDocumentText } from "./context-budget.js";
import type { DocumentCitationSource } from "./citations.js";

export type BuiltDocumentContext = {
  text: string;
  sources: DocumentCitationSource[];
};

function sanitizeMetadata(value: string) {
  return value.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

function neutralizeSourceDelimiter(value: string) {
  return value.replace(/<\/?SOURCE\b/gi, "[source]").replace(/\u0000/g, "");
}

export function buildDocumentContext(
  chunks: RetrievedChunk[],
  maxChars = DOCUMENT_CONTEXT.maxCharsPerBatch
): BuiltDocumentContext {
  const sources: DocumentCitationSource[] = [];
  const blocks: string[] = [];
  const seen = new Set<string>();
  let used = 0;

  for (const chunk of chunks) {
    const key = `${chunk.documentId}\u0000${chunk.locator ?? ""}\u0000${chunk.text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const id = `S${sources.length + 1}`;
    const documentName = sanitizeMetadata(chunk.documentName || chunk.documentId);
    const locator = chunk.locator ? sanitizeMetadata(chunk.locator) : undefined;
    const text = neutralizeSourceDelimiter(truncateDocumentText(chunk.text));
    const block = [
      `<SOURCE id="${id}">`,
      `document: ${documentName}`,
      `locator: ${locator ?? "trecho"}`,
      "text:",
      text,
      "</SOURCE>"
    ].join("\n");

    if (blocks.length && used + block.length + 2 > maxChars) break;
    if (!blocks.length && block.length > maxChars) {
      const available = Math.max(200, maxChars - 160);
      const shortened = [
        `<SOURCE id="${id}">`,
        `document: ${documentName}`,
        `locator: ${locator ?? "trecho"}`,
        "text:",
        neutralizeSourceDelimiter(text.slice(0, available)),
        "</SOURCE>"
      ].join("\n");
      blocks.push(shortened);
      sources.push({ id, documentId: chunk.documentId, documentName, locator });
      break;
    }

    blocks.push(block);
    sources.push({ id, documentId: chunk.documentId, documentName, locator });
    used += block.length + 2;
  }

  return { text: blocks.join("\n\n"), sources };
}
