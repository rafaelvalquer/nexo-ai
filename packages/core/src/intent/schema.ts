import {z} from "zod";
import {intentOperationContracts} from "./operation-contracts.js";
import type {CanonicalIntent,IntentEntity,IntentEntityValue} from "./types.js";

const primitiveEntitySchema=z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]);
const ambiguitySchema=z.object({code:z.string().min(1),field:z.string().optional(),message:z.string().min(1),critical:z.boolean().optional()}).strict();
const domainSchema=z.enum(["filesystem","system","web","browser","email","calendar","documents","memory","unknown"]);
const actionSchema=z.enum(["create","read","update","delete","find","list","open","execute","unknown"]);

const baseModelIntentSchema=z.object({
 schemaVersion:z.literal(1).default(1),
 domain:domainSchema,
 intent:actionSchema,
 operation:z.string().min(1),
 entities:z.record(primitiveEntitySchema).default({}),
 referencesPreviousResult:z.boolean().default(false),
 ambiguities:z.array(ambiguitySchema).default([]),
 missing:z.array(z.string()).default([]),
 modelConfidence:z.number().min(0).max(1).default(.8)
}).strict();

export const modelIntentSchema=baseModelIntentSchema.superRefine((value,ctx)=>{
 if(value.operation==="unknown"){
  if(value.domain!=="unknown"||value.intent!=="unknown")ctx.addIssue({code:z.ZodIssueCode.custom,path:["operation"],message:"unknown exige domain/intent unknown"});
  if(Object.keys(value.entities).length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["entities"],message:"unknown não aceita entidades"});
  return;
 }
 const contract=intentOperationContracts[value.operation];
 if(!contract){ctx.addIssue({code:z.ZodIssueCode.custom,path:["operation"],message:`Operação não registrada: ${value.operation}`});return;}
 if(value.domain!==contract.domain)ctx.addIssue({code:z.ZodIssueCode.custom,path:["domain"],message:`Domínio incompatível com ${value.operation}`});
 if(value.intent!==contract.intent)ctx.addIssue({code:z.ZodIssueCode.custom,path:["intent"],message:`Intent incompatível com ${value.operation}`});
 const allowed=new Set(contract.allowedEntities);
 for(const key of Object.keys(value.entities))if(!allowed.has(key))ctx.addIssue({code:z.ZodIssueCode.custom,path:["entities",key],message:`Entidade não permitida em ${value.operation}`});
 const required=new Set(contract.requiredEntities);
 for(const field of value.missing)if(!required.has(field))ctx.addIssue({code:z.ZodIssueCode.custom,path:["missing"],message:`Campo missing inválido para ${value.operation}: ${field}`});
});
export type ModelIntent=z.infer<typeof modelIntentSchema>;

const entityValueJsonSchema={oneOf:[{type:"string"},{type:"number"},{type:"boolean"},{type:"array",items:{type:"string"}}]};
const ambiguityJsonSchema={type:"object",additionalProperties:false,required:["code","message"],properties:{code:{type:"string"},field:{type:"string"},message:{type:"string"},critical:{type:"boolean"}}};
const baseProperties={schemaVersion:{const:1},referencesPreviousResult:{type:"boolean"},ambiguities:{type:"array",items:ambiguityJsonSchema},missing:{type:"array",items:{type:"string"}},modelConfidence:{type:"number",minimum:0,maximum:1}};

function operationVariant(operation:string){
 const contract=intentOperationContracts[operation];
 if(!contract)throw new Error(`Contrato inexistente: ${operation}`);
 return{type:"object",additionalProperties:false,required:["schemaVersion","domain","intent","operation","entities","referencesPreviousResult","ambiguities","missing","modelConfidence"],properties:{...baseProperties,domain:{const:contract.domain},intent:{const:contract.intent},operation:{const:operation},entities:{type:"object",additionalProperties:false,properties:Object.fromEntries(contract.allowedEntities.map(key=>[key,entityValueJsonSchema]))}}};
}
const unknownVariant={type:"object",additionalProperties:false,required:["schemaVersion","domain","intent","operation","entities","referencesPreviousResult","ambiguities","missing","modelConfidence"],properties:{...baseProperties,domain:{const:"unknown"},intent:{const:"unknown"},operation:{const:"unknown"},entities:{type:"object",additionalProperties:false,properties:{}}}};

export function modelIntentJsonSchemaFor(availableOperations:string[],allowedDomains?:string[]){
 const allowedDomainSet=allowedDomains?.length?new Set(allowedDomains):undefined;
 const variants=[...new Set(availableOperations)].filter(operation=>operation!=="unknown").filter(operation=>{
  const contract=intentOperationContracts[operation];return Boolean(contract&&(!allowedDomainSet||allowedDomainSet.has(contract.domain)));
 }).map(operationVariant);
 return{oneOf:[...variants,unknownVariant]} as Record<string,unknown>;
}

export const modelIntentJsonSchema=modelIntentJsonSchemaFor(Object.keys(intentOperationContracts));

export function parseModelIntent(value:unknown):ModelIntent{return modelIntentSchema.parse(value);}

export function toCanonicalIntent(model:ModelIntent):CanonicalIntent{
 const entities:Record<string,IntentEntity>={};
 for(const[key,value]of Object.entries(model.entities)){if(value===undefined)continue;entities[key]={value:value as IntentEntityValue,source:"user",confidence:model.modelConfidence};}
 return{schemaVersion:1,domain:model.domain,intent:model.intent,operation:model.operation,entities,referencesPreviousResult:model.referencesPreviousResult,ambiguities:model.ambiguities,missing:model.missing,source:"llm",diagnostics:{rawModelConfidence:model.modelConfidence,modelDeclaredMissing:model.missing,resolverVersion:"structured-intent-v2"}};
}
