import { z } from "zod";
import { intentOperationContracts, type IntentEntityKey } from "./operation-contracts.js";
import type { CanonicalIntent, IntentEntity, IntentEntityValue } from "./types.js";

const primitiveEntitySchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const ambiguitySchema = z.object({
  code: z.string().min(1),
  field: z.string().optional(),
  message: z.string().min(1),
  critical: z.boolean().optional()
}).strict();

const baseModelIntentFields = {
  schemaVersion: z.literal(1).default(1),
  referencesPreviousResult: z.boolean().default(false),
  ambiguities: z.array(ambiguitySchema).default([]),
  missing: z.array(z.string()).default([]),
  modelConfidence: z.number().min(0).max(1).default(0.8)
};

function buildZodEntitiesSchema(allowedKeys: readonly IntentEntityKey[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of allowedKeys) {
    shape[key] = primitiveEntitySchema.optional();
  }
  return z.object(shape).strict().default({});
}

function buildZodOperationSchema(operation: string) {
  const contract = intentOperationContracts[operation];
  if (!contract || operation === "unknown") {
    return z.object({
      ...baseModelIntentFields,
      domain: z.literal("unknown").default("unknown"),
      intent: z.literal("unknown").default("unknown"),
      operation: z.literal("unknown").default("unknown"),
      entities: z.object({}).strict().default({})
    }).strict();
  }
  return z.object({
    ...baseModelIntentFields,
    domain: z.literal("filesystem").default("filesystem"),
    intent: z.literal(contract.intent),
    operation: z.literal(operation),
    entities: buildZodEntitiesSchema(contract.allowedEntities)
  }).strict();
}

export const modelIntentSchema = z.discriminatedUnion("operation", [
  buildZodOperationSchema("create_folder"),
  buildZodOperationSchema("create_text_file"),
  buildZodOperationSchema("write_text_file"),
  buildZodOperationSchema("find_file"),
  buildZodOperationSchema("list_files"),
  buildZodOperationSchema("search_files"),
  buildZodOperationSchema("read_file"),
  buildZodOperationSchema("file_info"),
  buildZodOperationSchema("copy_file"),
  buildZodOperationSchema("move_file"),
  buildZodOperationSchema("rename_file"),
  buildZodOperationSchema("trash_file"),
  buildZodOperationSchema("unknown")
]);

export type ModelIntent = z.infer<typeof modelIntentSchema>;

const entityValueJsonSchema = {
  oneOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "array", items: { type: "string" } }
  ]
};

const ambiguityJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message"],
  properties: {
    code: { type: "string" },
    field: { type: "string" },
    message: { type: "string" },
    critical: { type: "boolean" }
  }
};

const baseProperties = {
  schemaVersion: { const: 1 },
  referencesPreviousResult: { type: "boolean" },
  ambiguities: { type: "array", items: ambiguityJsonSchema },
  missing: { type: "array", items: { type: "string" } },
  modelConfidence: { type: "number", minimum: 0, maximum: 1 }
};

function buildEntitiesJsonSchema(allowedKeys: readonly IntentEntityKey[]) {
  const properties = Object.fromEntries(
    allowedKeys.map(key => [key, entityValueJsonSchema])
  );
  return {
    type: "object",
    additionalProperties: false,
    properties
  };
}

function operationVariant(operation: string, description: string) {
  const contract = intentOperationContracts[operation];
  const allowedKeys = contract ? contract.allowedEntities : [];
  const intent = contract ? contract.intent : "unknown";

  return {
    type: "object",
    description,
    additionalProperties: false,
    required: [
      "schemaVersion",
      "domain",
      "intent",
      "operation",
      "entities",
      "referencesPreviousResult",
      "ambiguities",
      "missing",
      "modelConfidence"
    ],
    properties: {
      ...baseProperties,
      domain: { const: operation === "unknown" ? "unknown" : "filesystem" },
      intent: { const: intent },
      operation: { const: operation },
      entities: buildEntitiesJsonSchema(allowedKeys)
    }
  };
}

export const modelIntentJsonSchema = {
  oneOf: [
    operationVariant("create_folder", "Criar pasta/diretório. Entidades ausentes ficam ausentes e devem ser listadas em missing; nunca invente folder."),
    operationVariant("create_text_file", "Criar arquivo textual. name/folder podem estar ausentes; content é opcional."),
    operationVariant("write_text_file", "Alterar conteúdo de arquivo. file/content ausentes devem ficar em missing."),
    operationVariant("find_file", "Localizar arquivo específico por nome. folder é opcional."),
    operationVariant("search_files", "Pesquisar arquivos por termo ou critério. folder é opcional."),
    operationVariant("list_files", "Listar conteúdo de pasta. folder ausente deve ficar em missing."),
    operationVariant("read_file", "Ler arquivo por path explicitamente fornecido."),
    operationVariant("file_info", "Obter informações de arquivo por path explicitamente fornecido."),
    operationVariant("copy_file", "Copiar arquivo com source/destination explicitamente fornecidos."),
    operationVariant("move_file", "Mover arquivo com source/destination explicitamente fornecidos."),
    operationVariant("rename_file", "Renomear arquivo por path e newName."),
    operationVariant("trash_file", "Mover arquivo por path para a lixeira."),
    operationVariant("unknown", "Use somente para pedido não executável em filesystem: informacional, negado, outro domínio ou realmente não classificável.")
  ]
} as Record<string, unknown>;

export function parseModelIntent(value: unknown): ModelIntent {
  return modelIntentSchema.parse(value);
}

export function toCanonicalIntent(model: ModelIntent): CanonicalIntent {
  const entities: Record<string, IntentEntity> = {};
  for (const [key, value] of Object.entries(model.entities)) {
    if (value === undefined) continue;
    entities[key] = { value: value as IntentEntityValue, source: "user", confidence: model.modelConfidence };
  }
  return {
    schemaVersion: 1,
    domain: model.domain as CanonicalIntent["domain"],
    intent: model.intent as CanonicalIntent["intent"],
    operation: model.operation,
    entities,
    referencesPreviousResult: model.referencesPreviousResult,
    ambiguities: model.ambiguities,
    missing: model.missing,
    source: "llm",
    diagnostics: {
      rawModelConfidence: model.modelConfidence,
      modelDeclaredMissing: model.missing,
      resolverVersion: "hybrid-intent-v1"
    }
  };
}
