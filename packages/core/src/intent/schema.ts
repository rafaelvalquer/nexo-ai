import { z } from "zod";
import type { CanonicalIntent, IntentEntity, IntentEntityValue } from "./types.js";

const primitiveEntitySchema=z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]);
const ambiguitySchema=z.object({code:z.string().min(1),field:z.string().optional(),message:z.string().min(1),critical:z.boolean().optional()}).strict();
const entitiesSchema=z.object({
  name:primitiveEntitySchema.optional(),
  file:primitiveEntitySchema.optional(),
  folder:primitiveEntitySchema.optional(),
  path:primitiveEntitySchema.optional(),
  content:primitiveEntitySchema.optional(),
  query:primitiveEntitySchema.optional(),
  source:primitiveEntitySchema.optional(),
  destination:primitiveEntitySchema.optional(),
  newName:primitiveEntitySchema.optional()
}).strict();

export const modelIntentSchema=z.object({
  schemaVersion:z.literal(1).default(1),
  domain:z.enum(["filesystem","unknown"]),
  intent:z.enum(["create","read","update","delete","find","list","open","execute","unknown"]),
  operation:z.enum(["find_file","list_files","search_files","create_folder","create_text_file","read_file","write_text_file","copy_file","move_file","rename_file","trash_file","file_info","unknown"]),
  entities:entitiesSchema.default({}),
  referencesPreviousResult:z.boolean().default(false),
  ambiguities:z.array(ambiguitySchema).default([]),
  missing:z.array(z.string()).default([]),
  modelConfidence:z.number().min(0).max(1).default(.8)
}).strict();

export type ModelIntent=z.infer<typeof modelIntentSchema>;

const entityValueJsonSchema={oneOf:[
  {type:"string"},
  {type:"number"},
  {type:"boolean"},
  {type:"array",items:{type:"string"}}
]};
const entityProperties=Object.fromEntries(
  ["name","file","folder","path","content","query","source","destination","newName"].map(key=>[key,entityValueJsonSchema])
);
const ambiguityJsonSchema={
  type:"object",
  additionalProperties:false,
  required:["code","message"],
  properties:{
    code:{type:"string"},
    field:{type:"string"},
    message:{type:"string"},
    critical:{type:"boolean"}
  }
};
const baseProperties={
  schemaVersion:{const:1},
  referencesPreviousResult:{type:"boolean"},
  ambiguities:{type:"array",items:ambiguityJsonSchema},
  missing:{type:"array",items:{type:"string"}},
  modelConfidence:{type:"number",minimum:0,maximum:1}
};
const entitiesJsonSchema={
  type:"object",
  additionalProperties:false,
  properties:entityProperties
};

function operationVariant(operation:string,intent:string,description:string){
  return{
    type:"object",
    description,
    additionalProperties:false,
    required:["schemaVersion","domain","intent","operation","entities","referencesPreviousResult","ambiguities","missing","modelConfidence"],
    properties:{
      ...baseProperties,
      domain:{const:"filesystem"},
      intent:{const:intent},
      operation:{const:operation},
      entities:entitiesJsonSchema
    }
  };
}

export const modelIntentJsonSchema={
  oneOf:[
    operationVariant("create_folder","create","Criar pasta/diretório. Entidades ausentes ficam ausentes e devem ser listadas em missing; nunca invente folder."),
    operationVariant("create_text_file","create","Criar arquivo textual. name/folder podem estar ausentes; content é opcional."),
    operationVariant("write_text_file","update","Alterar conteúdo de arquivo. file/content ausentes devem ficar em missing."),
    operationVariant("find_file","find","Localizar arquivo específico por nome. folder é opcional."),
    operationVariant("search_files","find","Pesquisar arquivos por termo ou critério. folder é opcional."),
    operationVariant("list_files","list","Listar conteúdo de pasta. folder ausente deve ficar em missing."),
    operationVariant("read_file","read","Ler arquivo por path explicitamente fornecido."),
    operationVariant("file_info","read","Obter informações de arquivo por path explicitamente fornecido."),
    operationVariant("copy_file","update","Copiar arquivo com source/destination explicitamente fornecidos."),
    operationVariant("move_file","update","Mover arquivo com source/destination explicitamente fornecidos."),
    operationVariant("rename_file","update","Renomear arquivo por path e newName."),
    operationVariant("trash_file","delete","Mover arquivo por path para a lixeira."),
    {
      type:"object",
      description:"Use somente para pedido não executável em filesystem: informacional, negado, outro domínio ou realmente não classificável.",
      additionalProperties:false,
      required:["schemaVersion","domain","intent","operation","entities","referencesPreviousResult","ambiguities","missing","modelConfidence"],
      properties:{
        ...baseProperties,
        domain:{const:"unknown"},
        intent:{const:"unknown"},
        operation:{const:"unknown"},
        entities:{type:"object",additionalProperties:false,properties:{}}
      }
    }
  ]
} as Record<string,unknown>;

export function parseModelIntent(value:unknown):ModelIntent{
  return modelIntentSchema.parse(value);
}

export function toCanonicalIntent(model:ModelIntent):CanonicalIntent{
  const entities:Record<string,IntentEntity>={};
  for(const [key,value] of Object.entries(model.entities)){
    if(value===undefined)continue;
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
