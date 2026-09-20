import {z} from "zod";
import {zodToJsonSchema} from "zod-to-json-schema";
import {intentDomains,type DomainCandidate} from "./types.js";
const model=z.object({domain:z.enum(intentDomains),confidence:z.number().min(0).max(1),evidence:z.array(z.string().max(120)).max(8)}).strict();
export const domainResolutionJsonSchema=zodToJsonSchema(model,{$refStrategy:"none"}) as Record<string,unknown>;
export function parseDomainCandidate(value:unknown):DomainCandidate{const parsed=model.parse(value);return{...parsed,source:"llm"};}
