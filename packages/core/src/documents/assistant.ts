import type { LLMMessage, LLMProvider } from "../llm/provider.js";
import type { LocalMetricsService } from "../observability/metrics.js";
import { buildDocumentContext } from "./context-builder.js";
import { DOCUMENT_CONTEXT } from "./context-budget.js";
import { renderDocumentCitations, type DocumentCitationSource } from "./citations.js";
import { classifyDocumentIntent, type DocumentIntent } from "./intent-router.js";
import {
  documentComparisonMessages,
  documentQaMessages
} from "./prompts.js";
import type { DocumentService, RetrievedChunk } from "./service.js";
import { DocumentSummarizer, type DocumentOperationOptions } from "./summarizer.js";

export type DocumentAssistantResult = {
  text: string;
  sources?: DocumentCitationSource[];
  intent: DocumentIntent;
  approvalId?: undefined;
};

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelada pelo usuário.", "AbortError");
}

export class DocumentAssistantService {
  private summarizer: DocumentSummarizer;

  constructor(
    private documents: DocumentService,
    private llm: LLMProvider,
    private metrics?: LocalMetricsService
  ) {
    this.summarizer = new DocumentSummarizer(documents, llm, metrics);
  }

  classifyIntent(userText: string, documentCount: number) {
    return classifyDocumentIntent(userText, documentCount);
  }

  async process(
    documentIds: string[],
    userText: string,
    options: DocumentOperationOptions = {}
  ): Promise<DocumentAssistantResult> {
    const uniqueIds = [...new Set(documentIds)].filter(Boolean);
    if (!uniqueIds.length) throw new Error("Nenhum documento foi selecionado para análise.");
    await this.documents.waitUntilReady(uniqueIds,{signal:options.signal});

    assertNotAborted(options.signal);
    const intent = this.classifyIntent(userText, uniqueIds.length);

    switch (intent) {
      case "summarize":
        return {
          text: await this.summarizer.summarizeDocument(uniqueIds, userText, options),
          intent
        };
      case "compare":
        return this.compare(uniqueIds, userText, options);
      case "extract":
        return this.extract(uniqueIds, userText, options);
      case "edit":
        return {
          intent,
          text: "A solicitação de edição foi identificada. Para preservar versões, validações e aprovações, use a ação de edição assistida do documento. Nenhuma alteração foi aplicada pelo chat."
        };
      case "question":
      case "general":
      default:
        return this.answerQuestion(uniqueIds, userText, options);
    }
  }

  async answerQuestion(documentIds: string[], question: string, options: DocumentOperationOptions = {}): Promise<DocumentAssistantResult> {
    const startedAt = Date.now();
    this.metrics?.record("document.qa.started", 1, { documents: documentIds.length });
    try {
      assertNotAborted(options.signal);
      options.onStatus?.("Buscando trechos relevantes…");
      const matches = await this.documents.retrieve(documentIds, question, {
        limit: DOCUMENT_CONTEXT.maxRetrievedChunks,
        maxChunkChars: DOCUMENT_CONTEXT.maxChunkChars
      });
      this.metrics?.record("document.retrieval.chunks", matches.length, { operation: "qa" });
      if (!matches.length) {
        const text = "Não encontrei essa informação nos documentos selecionados.";
        this.metrics?.record("document.qa.completed", 1, { found: false });
        this.metrics?.record("document.processing_ms", Date.now() - startedAt, { operation: "qa" });
        return { text, intent: "question", sources: [] };
      }

      options.onStatus?.("Analisando documento…");
      const context = buildDocumentContext(matches);
      if (!context.text) {
        return { text: "Não encontrei contexto suficiente nos documentos selecionados.", intent: "question", sources: [] };
      }
      options.onStatus?.("Gerando resposta…");
      const raw = await this.generate(documentQaMessages(question, context.text), options);
      this.metrics?.record("document.llm.calls", 1, { operation: "qa" });
      const text = renderDocumentCitations(raw, context.sources) || "Não encontrei essa informação nos documentos selecionados.";
      this.metrics?.record("document.qa.completed", 1, { found: true });
      this.metrics?.record("document.processing_ms", Date.now() - startedAt, { operation: "qa" });
      return { text, intent: "question", sources: context.sources };
    } catch (error) {
      this.metrics?.record("document.qa.failed", 1, { documents: documentIds.length });
      this.metrics?.record("document.processing_ms", Date.now() - startedAt, { operation: "qa" });
      throw error;
    }
  }

  private async extract(documentIds: string[], request: string, options: DocumentOperationOptions): Promise<DocumentAssistantResult> {
    assertNotAborted(options.signal);
    options.onStatus?.("Lendo documento…");
    const all = this.documents.getChunksForDocuments(documentIds);
    const totalChars = all.reduce((sum, chunk) => sum + chunk.text.length, 0);
    const chunks = totalChars <= DOCUMENT_CONTEXT.maxCharsPerBatch
      ? all
      : await this.documents.retrieve(documentIds, request, {
          limit: DOCUMENT_CONTEXT.maxRetrievedChunks,
          maxChunkChars: DOCUMENT_CONTEXT.maxChunkChars
        });
    if (!chunks.length) return { text: "Não encontrei conteúdo suficiente para realizar a extração.", intent: "extract", sources: [] };
    const context = buildDocumentContext(chunks);
    options.onStatus?.("Gerando resposta…");
    const raw = await this.generate(documentQaMessages(`Extraia do documento o que foi solicitado: ${request}`, context.text), options);
    this.metrics?.record("document.llm.calls", 1, { operation: "extract" });
    return { text: renderDocumentCitations(raw, context.sources), intent: "extract", sources: context.sources };
  }

  private async compare(documentIds: string[], request: string, options: DocumentOperationOptions): Promise<DocumentAssistantResult> {
    if (documentIds.length !== 2) {
      return { text: "Selecione exatamente dois documentos para comparar.", intent: "compare", sources: [] };
    }
    assertNotAborted(options.signal);
    options.onStatus?.("Comparando documentos…");
    const diff = this.documents.compare(documentIds);
    const supporting: RetrievedChunk[] = [
      ...diff.left.exclusive.map((item, index) => ({
        documentId: documentIds[0],
        documentName: diff.left.name,
        locator: item.locator,
        text: item.text,
        score: 1,
        ordinal: index
      })),
      ...diff.right.exclusive.map((item, index) => ({
        documentId: documentIds[1],
        documentName: diff.right.name,
        locator: item.locator,
        text: item.text,
        score: 1,
        ordinal: index
      }))
    ];
    const context = buildDocumentContext(supporting, DOCUMENT_CONTEXT.maxCharsPerBatch);
    const deterministicSummary = [
      `${diff.left.name}: ${diff.left.exclusive.length} trecho(s) exclusivo(s).`,
      `${diff.right.name}: ${diff.right.exclusive.length} trecho(s) exclusivo(s).`,
      `Trechos coincidentes: ${diff.sharedChunkCount}.`
    ].join("\n");

    if (!supporting.length) {
      return {
        text: `Não identifiquei diferenças textuais nos trechos indexados. Trechos coincidentes: ${diff.sharedChunkCount}.`,
        intent: "compare",
        sources: []
      };
    }

    options.onStatus?.("Gerando comparação…");
    const raw = await this.generate(documentComparisonMessages(request, deterministicSummary, context.text), options);
    this.metrics?.record("document.llm.calls", 1, { operation: "compare" });
    return { text: renderDocumentCitations(raw, context.sources), intent: "compare", sources: context.sources };
  }

  private generate(messages: LLMMessage[], options: DocumentOperationOptions) {
    assertNotAborted(options.signal);
    return options.onToken
      ? this.llm.stream(messages, options.onToken, options.signal)
      : this.llm.chat(messages, options.signal);
  }
}
