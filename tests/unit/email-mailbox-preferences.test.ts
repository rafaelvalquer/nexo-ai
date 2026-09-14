import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db";
import { EmailSearchPreferenceRepository } from "../../packages/core/src/email/preferences/repository";
import { EmailSearchPreferenceService } from "../../packages/core/src/email/preferences/service";
import { defaultMailboxCategories, getMailboxOptions } from "../../packages/core/src/email/preferences/category-resolver";
import { buildGmailSearchQuery } from "../../packages/core/src/email/google/query-builder";
import { deterministicEmailCategoryIntent, deterministicEmailPreferenceIntent } from "../../packages/core/src/agent/orchestrator/email-intent-enricher";
import { resolveFallbackIntent } from "../../packages/core/src/agent/orchestrator/fallback-intent-resolver";
import { ClarificationResolver } from "../../packages/core/src/agent/clarification/resolver";
import { buildEmailMailboxQuestion } from "../../packages/core/src/agent/clarification/option-builders";
import { ClarificationRepository } from "../../packages/core/src/agent/clarification/repository";
import { ClarificationService } from "../../packages/core/src/agent/clarification/service";
import { AgentRuntime } from "../../packages/core/src/agent/runtime/runtime";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe("email mailbox preferences", () => {
  it("persiste categorias por conta e mantém contas independentes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-pref-")); roots.push(root);
    const db = new NexoDatabase(root); await db.ready();
    const service = new EmailSearchPreferenceService(new EmailSearchPreferenceRepository(db));
    service.save("conta-a", ["primary"]);
    service.save("conta-b", ["primary", "updates"]);

    const reopened = new NexoDatabase(root); await reopened.ready();
    const restored = new EmailSearchPreferenceService(new EmailSearchPreferenceRepository(reopened));
    expect(restored.get("conta-a")?.categories).toEqual(["primary"]);
    expect(restored.get("conta-b")?.categories).toEqual(["primary", "updates"]);
  });

  it("registra preferências e esclarecimentos na migração formal", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-migration-")); roots.push(root);
    const db = new NexoDatabase(root); await db.ready();
    expect(db.get<{version:number}>("SELECT version FROM schema_migrations WHERE version=14")?.version).toBe(14);
    expect(db.get<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name='email_search_preferences'")?.name).toBe("email_search_preferences");
    expect(db.get<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_clarifications'")?.name).toBe("pending_clarifications");
  });

  it("mantém o seletor pendente após reiniciar o runtime", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-pending-")); roots.push(root);
    const db = new NexoDatabase(root); await db.ready();
    const runtime = new AgentRuntime(db);
    const service = new ClarificationService(new ClarificationRepository(runtime), new ClarificationResolver({} as any));
    const intent = {
      schemaVersion: 1 as const,
      status: "ready" as const,
      domain: "email" as const,
      intent: "list" as const,
      operation: "recent_messages",
      entities: { maxResults: 20 },
      referencesPreviousResult: false,
      requiresDataLookup: true,
      requiresConfirmation: false,
      confidence: .99,
    };
    const created = service.createEmailMailboxPreference("conversation-1", "mostre meus e-mails", intent, "connection-1", "google", ["primary"], "initial");

    const reopenedDb = new NexoDatabase(root); await reopenedDb.ready();
    const reopenedRuntime = new AgentRuntime(reopenedDb);
    const restored = new ClarificationService(new ClarificationRepository(reopenedRuntime), new ClarificationResolver({} as any)).pending("conversation-1");
    expect(restored?.id).toBe(created.id);
    expect(restored?.status).toBe("pending");
    expect(restored?.questions[0]).toMatchObject({ type: "multi_choice", selectedOptionIds: ["primary"] });
    expect(restored?.partialEntities).toMatchObject({ connectionId: "connection-1", __emailPreferenceFlow: true, __emailProvider: "google" });
  });

  it("não permite seleção vazia", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-empty-")); roots.push(root);
    const db = new NexoDatabase(root); await db.ready();
    const service = new EmailSearchPreferenceService(new EmailSearchPreferenceRepository(db));
    expect(() => service.save("conta", [])).toThrow("Selecione pelo menos uma caixa");
  });

  it("usa Principal por padrão no Google e Inbox no Microsoft", () => {
    expect(defaultMailboxCategories("google")).toEqual(["primary"]);
    expect(defaultMailboxCategories("microsoft")).toEqual(["inbox"]);
    expect(getMailboxOptions("microsoft").map(option => option.id)).toEqual(["inbox"]);
    expect(getMailboxOptions("google").map(option => option.id)).toEqual(["primary", "promotions", "social", "updates", "forums"]);
  });
});

describe("GmailQueryBuilder", () => {
  it("sempre restringe a busca à caixa de entrada", () => {
    expect(buildGmailSearchQuery({ categories: ["primary"] })).toBe("in:inbox category:primary");
  });

  it("combina múltiplas categorias como OR", () => {
    expect(buildGmailSearchQuery({ categories: ["primary", "updates"], unread: true }))
      .toBe("in:inbox is:unread {category:primary category:updates}");
  });

  it("simplifica todas as categorias para in:inbox", () => {
    expect(buildGmailSearchQuery({ categories: ["primary", "promotions", "social", "updates", "forums"] }))
      .toBe("in:inbox");
  });
});

describe("email intent enrichment", () => {
  it("roteia configuração das caixas sem depender da LLM", () => {
    expect(deterministicEmailPreferenceIntent("selecionar caixas de e-mails")).toMatchObject({
      domain: "email", intent: "update", operation: "select_mailboxes"
    });
  });

  it("trata categoria explícita como override da consulta", () => {
    expect(deterministicEmailCategoryIntent("mostre meus emails de Promoções")).toMatchObject({
      domain: "email",
      entities: { categories: ["promotions"], maxResults: 20 }
    });
  });

  it("mantém configuração e categorias explícitas no fallback", () => {
    expect(resolveFallbackIntent("selecionar caixas de e-mails")).toMatchObject({
      domain: "email", intent: "update", operation: "select_mailboxes"
    });
    expect(resolveFallbackIntent("mostre meus emails de Promoções")).toMatchObject({
      domain: "email", entities: { categories: ["promotions"] }
    });
  });
});

describe("mailbox clarification", () => {
  const resolver = new ClarificationResolver({} as any);

  it("mantém Principal pré-marcada no primeiro uso", () => {
    const question = buildEmailMailboxQuestion("google", ["primary"], "initial");
    expect(question.type).toBe("multi_choice");
    expect(question.selectedOptionIds).toEqual(["primary"]);
    expect(question.submitLabel).toBe("Salvar e continuar");
  });

  it("resolve múltiplas caixas e rejeita seleção vazia", () => {
    const question = buildEmailMailboxQuestion("google", ["primary"], "initial");
    expect(resolver.resolve(question, { optionIds: ["primary", "updates"] })).toEqual({
      resolved: true,
      value: ["primary", "updates"],
      source: "button",
    });
    expect(resolver.resolve(question, { optionIds: [] })).toMatchObject({ resolved: false });
  });

  it("aceita selecionar todas as caixas pelo texto do chat", () => {
    const question = buildEmailMailboxQuestion("google", ["primary"], "initial");
    expect(resolver.resolve(question, { chatText: "todas" })).toEqual({
      resolved: true,
      value: ["primary", "promotions", "social", "updates", "forums"],
      source: "chat_text",
    });
  });
});
