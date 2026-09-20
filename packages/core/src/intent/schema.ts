import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { filesystemOperations, type CanonicalIntent, type IntentEntity, type IntentEntityValue } from "./types.js";

const primitiveEntitySchema=z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]);
const ambiguitySchema=z.object({
  code:z.string().min(1),
  field:z.string().optional(),
  message:z.string().min(1),
  critical:z.boolean().optional()
});
const phase1Operations=[...filesystemOperations,"unknown"] as const;

export const modelIntentSchema=z.object({
  schemaVersion:z.literal(1).default(1),
  domain:z.enum(["filesystem","unknown"]).describe("Use filesystem para operações de arquivos/pastas e unknown apenas quando o pedido não for executável no domínio filesystem."),
  intent:z.enum(["create","read","update","delete","find","list","open","execute","unknown"]).describe("Ação semântica geral correspondente à operation."),
  operation:z.enum(phase1Operations).describe("Escolha somente uma operação filesystem da allowlist ou unknown quando nenhuma se aplicar."),
  entities:z.record(primitiveEntitySchema).default({}).describe("Entidades literais do pedido. Preserve nomes, conteúdo e escopos informados pelo usuário."),
  referencesPreviousResult:z.boolean().default(false),
  ambiguities:z.array(ambiguitySchema).default([]).describe("Ambiguidades reais que exigem clarificação; não invente ambiguidades quando o pedido estiver claro."),
  missing:z.array(z.string()).default([]).describe("Campos obrigatórios ausentes para a operação escolhida."),
  modelConfidence:z.number().min(0).max(1).default(.8)
});

export type ModelIntent=z.infer<typeof modelIntentSchema>;

export const modelIntentJsonSchema=zodToJsonSchema(modelIntentSchema,{
  $refStrategy:"none",
  name:"NexoHybridIntentV1"
}) as Record<string,unknown>;

export function parseModelIntent(value:unknown):ModelIntent{
  return modelIntentSchema.parse(value);
}

export function toCanonicalIntent(model:ModelIntent):CanonicalIntent{
  const entities:Record<string,IntentEntity>={};
  for(const [key,value] of Object.entries(model.entities)){
    entities[key]={value:value as IntentEntityValue,source:"user",confidence:model.modelConfidence};
  }
  return{
    schemaVersion:1,
    domain:model.domain,
    intent:model.intent,
    operation:model.operation,
    entities,
    referencesPreviousResult:model.referencesPreviousResult,
    ambiguities:model.ambiguities,
    missing:model.missing,
    source:"llm",
    diagnostics:{rawModelConfidence:model.modelConfidence,resolverVersion:"hybrid-intent-v1"}
  };
}
