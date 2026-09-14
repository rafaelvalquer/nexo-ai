import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { intentDomainSchema, normalizeDomain, type IntentDomain } from "./domain-v1.js";

export const intentNameSchema = z.enum(["list", "search", "read", "summarize", "stats", "create", "send", "update", "delete", "move", "answer", "help"]);
export type IntentName = z.infer<typeof intentNameSchema>;

const referenceSchema = z.object({
  source: z.literal("previous_result"),
  selection: z.object({
    type: z.enum(["all", "first", "indices"]),
    count: z.number().int().min(1).max(100).optional(),
    indices: z.array(z.number().int().min(1)).max(100).optional()
  })
}).optional();

export const agentIntentV1Schema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["ready", "needs_clarification"]),
  domain: intentDomainSchema,
  intent: intentNameSchema,
  operation: z.string().min(1),
  entities: z.record(z.unknown()),
  referencesPreviousResult: z.boolean(),
  reference: referenceSchema,
  requiresDataLookup: z.boolean(),
  requiresConfirmation: z.boolean(),
  confidence: z.number().min(0).max(1),
  missing: z.array(z.string()).optional(),
  question: z.string().optional()
});

export type AgentIntentV1 = z.infer<typeof agentIntentV1Schema>;

export function schemaForIntentDomain(domain: IntentDomain) {
  return agentIntentV1Schema.extend({ domain: z.literal(domain) });
}

export function jsonSchemaForIntentDomain(domain: IntentDomain) {
  return zodToJsonSchema(schemaForIntentDomain(domain), {
    $refStrategy: "none",
    name: `Nexo${domain[0].toUpperCase()}${domain.slice(1)}IntentV1`
  }) as Record<string, unknown>;
}

export function parseAgentIntentV1(value: unknown, expectedDomain?: IntentDomain): AgentIntentV1 {
  const normalized = normalizePayload(value);
  const parsed = agentIntentV1Schema.parse(normalized);
  if (expectedDomain && parsed.domain !== expectedDomain) {
    throw new Error(`Domínio estruturado inesperado: esperado ${expectedDomain}, recebido ${parsed.domain}.`);
  }
  return parsed;
}

function normalizePayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = { ...value };
  if (output.schemaVersion === undefined) output.schemaVersion = 1;
  if (output.status === undefined) output.status = "ready";
  if (output.entities === undefined || !isRecord(output.entities)) output.entities = {};
  if (output.referencesPreviousResult === undefined) output.referencesPreviousResult = false;
  if (output.requiresDataLookup === undefined) output.requiresDataLookup = false;
  if (output.requiresConfirmation === undefined) output.requiresConfirmation = false;
  if (typeof output.domain === "string") output.domain = normalizeDomain(output.domain);
  if (typeof output.intent === "string") output.intent = normalizeIntent(output.intent);
  if (typeof output.confidence === "string") output.confidence = Number(output.confidence);
  for (const key of ["referencesPreviousResult", "requiresDataLookup", "requiresConfirmation"] as const) {
    if (typeof output[key] === "string") {
      if (output[key] === "true") output[key] = true;
      if (output[key] === "false") output[key] = false;
    }
  }
  return output;
}

function normalizeIntent(value: string): string {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, IntentName> = {
    remove: "delete",
    trash: "delete",
    apagar: "delete",
    deletar: "delete",
    excluir: "delete",
    create: "create",
    criar: "create",
    enviar: "send",
    compose: "send",
    listar: "list",
    mostrar: "list",
    procurar: "search",
    pesquisar: "search",
    resumir: "summarize",
    summary: "summarize"
  };
  return aliases[normalized] ?? normalized;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
