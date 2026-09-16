import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const intentDomainSchema = z.enum(["email", "calendar", "filesystem", "document", "browser", "system", "memory", "general"]);
export type IntentDomain = z.infer<typeof intentDomainSchema>;

export const domainClassificationV1Schema = z.object({
  schemaVersion: z.literal(1),
  domain: intentDomainSchema,
  confidence: z.number().min(0).max(1)
});

export type DomainClassificationV1 = z.infer<typeof domainClassificationV1Schema>;

export const domainClassificationV1JsonSchema = zodToJsonSchema(domainClassificationV1Schema, {
  $refStrategy: "none",
  name: "NexoDomainClassificationV1"
}) as Record<string, unknown>;

export function parseDomainClassificationV1(value: unknown): DomainClassificationV1 {
  const input = isRecord(value) ? { ...value } : value;
  if (isRecord(input)) {
    if (input.schemaVersion === undefined) input.schemaVersion = 1;
    if (typeof input.confidence === "string") input.confidence = Number(input.confidence);
    if (typeof input.domain === "string") input.domain = normalizeDomain(input.domain);
  }
  return domainClassificationV1Schema.parse(input);
}

export function normalizeDomain(value: string): string {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, IntentDomain> = {
    gmail: "email",
    mail: "email",
    emails: "email",
    "e-mail": "email",
    agenda: "calendar",
    calendario: "calendar",
    calendário: "calendar",
    files: "filesystem",
    file: "filesystem",
    arquivos: "filesystem",
    arquivo: "filesystem",
    pastas: "filesystem",
    pasta: "filesystem"
    ,documento: "document",
    documentos: "document",
    pdf: "document",
    docx: "document"
  };
  return aliases[normalized] ?? normalized;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
