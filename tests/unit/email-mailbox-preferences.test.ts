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
import { ClarificationResolver } from "../../packages/core/src/agent/clarification/resolver";
import { buildEmailMailboxQuestion } from "../../packages/core/src/agent/clarification/option-builders";

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
});
