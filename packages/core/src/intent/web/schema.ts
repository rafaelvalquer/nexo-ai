import {z} from "zod";
import {zodToJsonSchema} from "zod-to-json-schema";
import type {CanonicalWebIntent} from "./types.js";

const entities=z.object({
  sourceName:z.string().trim().min(1).max(120).optional(),
  searchProvider:z.enum(["default","google"]).optional(),
  domain:z.string().trim().min(3).max(253).optional(),
  url:z.string().url().max(2048).optional(),
  query:z.string().trim().min(1).max(1000).optional(),
  topic:z.string().trim().min(1).max(500).optional(),
  requestedAction:z.string().trim().min(1).max(500).optional()
}).strict();

export const webIntentModelSchema=z.object({
  schemaVersion:z.literal(1),domain:z.literal("web"),
  operation:z.enum(["navigate","search","fetch","research","interact","unknown"]),entities,
  requiresInformation:z.boolean(),requiresInteraction:z.boolean(),confidence:z.number().min(0).max(1),
  ambiguities:z.array(z.string().max(300)).max(10),missing:z.array(z.string().max(80)).max(10)
}).strict();
export const webIntentJsonSchema=zodToJsonSchema(webIntentModelSchema,{$refStrategy:"none"}) as Record<string,unknown>;
export function parseWebIntent(value:unknown):CanonicalWebIntent{return webIntentModelSchema.parse(value);}
