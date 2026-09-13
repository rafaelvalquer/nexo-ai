import type { LLMMessage, LLMProvider } from "../llm/provider.js";
import type { LocalMetricsService } from "../observability/metrics.js";
import type { DocumentService, RetrievedChunk } from "./service.js";
import { DOCUMENT_CONTEXT, splitByCharacterBudget, truncateDocumentText } from "./context-budget.js";
import {
  documentSummaryDirectMessages,
  documentSummaryMapMessages,
  documentSummaryReduceMessages
} from "./prompts.js";

export type DocumentOperationOptions = {
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onStatus?: (message: string) => void;
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelada pelo usuário.", "AbortError");
}

function summaryChunk(chunk: RetrievedChunk) {
  const text = truncateDocumentText(chunk.text, DOCUMENT_CONTEXT.maxChunkChars);
  return [
    `Documento: ${chunk.documentName}`,
    `Local: ${chunk.locator ?? "trecho"}`,
    "Conteúdo não confiável:",
    text
  ].join("\n");
}

function summariesLength(items: string[]) {
  return items.reduce((sum, item) => sum + item.length + 2, 0);
}

export class DocumentSummarizer {
  constructor(
    private documents: DocumentService,
    private llm: LLMProvider,
    private metrics?: LocalMetricsService
  ) {}

  async summarizeDocument(documentIds: string[], request: string, options: DocumentOperationOptions = {}) {
    const startedAt = Date.now();
    this.metrics?.record("document.summary.started", 1, { documents: documentIds.length });
    options.onStatus?.("Lendo documento…");

    try {
      assertNotAborted(options.signal);
      const chunks = this.documents.getChunksForDocuments(documentIds);
      if (!chunks.length) return "Não encontrei texto indexado nos documentos selecionados.";
      this.metrics?.record("document.summary.chunks", chunks.length, { documents: documentIds.length });

      const batches = splitByCharacterBudget(
        chunks,
        chunk => summaryChunk(chunk),
        DOCUMENT_CONTEXT.maxCharsPerBatch
      );
      this.metrics?.record("document.summary.batches", batches.length, { documents: documentIds.length });

      if (batches.length === 1) {
        options.onStatus?.("Analisando documento…");
        const content = batches[0].map(summaryChunk).join("\n\n");
        options.onStatus?.("Gerando resposta…");
        const result = await this.generate(documentSummaryDirectMessages(request, content), options);
        this.metrics?.record("document.llm.calls", 1, { operation: "summary-direct" });
        this.metrics?.record("document.summary.completed", 1, { mode: "direct" });
        this.metrics?.record("document.processing_ms", Date.now() - startedAt, { operation: "summary" });
        return result.trim();
      }

      const partials: string[] = [];
      for (const [index, batch] of batches.entries()) {
        assertNotAborted(options.signal);
        options.onStatus?.(`Resumindo parte ${index + 1} de ${batches.length}…`);
        const content = batch.map(summaryChunk).join("\n\n");
        const partial = await this.llm.chat(documentSummaryMapMessages(content), options.signal);
        this.metrics?.record("document.llm.calls", 1, { operation: "summary-map" });
        partials.push(partial.trim());
      }

      let reduced = partials;
      let pass = 0;
      while (summariesLength(reduced) > DOCUMENT_CONTEXT.maxCharsPerBatch && reduced.length > 1 && pass < 8) {
        assertNotAborted(options.signal);
        pass += 1;
        options.onStatus?.("Consolidando informações…");
        const groups = splitByCharacterBudget(
          reduced.map(text => text.length > DOCUMENT_CONTEXT.maxCharsPerBatch ? `${text.slice(0, DOCUMENT_CONTEXT.maxCharsPerBatch - 1)}…` : text),
          text => text,
          DOCUMENT_CONTEXT.maxCharsPerBatch
        );
        const next: string[] = [];
        for (const group of groups) {
          assertNotAborted(options.signal);
          const consolidated = await this.llm.chat(documentSummaryReduceMessages(group.join("\n\n---\n\n")), options.signal);
          this.metrics?.record("document.llm.calls", 1, { operation: "summary-reduce" });
          next.push(consolidated.trim());
        }
        reduced = next;
      }

      assertNotAborted(options.signal);
      options.onStatus?.("Consolidando informações…");
      const finalInput = reduced
        .map(text => text.length > DOCUMENT_CONTEXT.maxCharsPerBatch ? `${text.slice(0, DOCUMENT_CONTEXT.maxCharsPerBatch - 1)}…` : text)
        .join("\n\n---\n\n")
        .slice(0, DOCUMENT_CONTEXT.maxCharsPerBatch);
      options.onStatus?.("Gerando resposta…");
      const result = await this.generate(documentSummaryReduceMessages(finalInput), options);
      this.metrics?.record("document.llm.calls", 1, { operation: "summary-final" });
      this.metrics?.record("document.summary.completed", 1, { mode: "map-reduce" });
      this.metrics?.record("document.processing_ms", Date.now() - startedAt, { operation: "summary" });
      return result.trim();
    } catch (error) {
      this.metrics?.record("document.summary.failed", 1, { documents: documentIds.length });
      this.metrics?.record("document.processing_ms", Date.now() - startedAt, { operation: "summary" });
      throw error;
    }
  }

  private generate(messages: LLMMessage[], options: DocumentOperationOptions) {
    assertNotAborted(options.signal);
    return options.onToken
      ? this.llm.stream(messages, options.onToken, options.signal)
      : this.llm.chat(messages, options.signal);
  }
}
