import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { CanonicalIntent, IntentEntity, IntentEntityValue } from "./types.js";

const primitiveEntitySchema=z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]);
const ambiguitySchema=z.object({code:z.string().min(1),field:z.string().optional(),message:z.string().min(1),critical:z.boolean().optional()});

export const modelIntentSchema=z.object({
  schemaVersion:z.literal(1).default(1),
  domain:z.enum(["filesystem","system","web","email","calendar","documents","macro","chat","unknown"]),
  intent:z.enum(["create","read","update","delete","find","list","open","execute","unknown"]),
  operation:z.string().min(1),
  entities:z.record(primitiveEntitySchema).default({}),
  referencesPreviousResult:z.boolean().default(false),
  ambiguities:z.array(ambiguitySchema).default([]),
  missing:z.array(z.string()).default([]),
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
