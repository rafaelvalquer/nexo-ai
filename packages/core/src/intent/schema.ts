import { z } from "zod";
import type { CanonicalIntent, IntentEntity, IntentEntityValue } from "./types.js";

const primitiveEntitySchema=z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]);
const ambiguitySchema=z.object({code:z.string().min(1),field:z.string().optional(),message:z.string().min(1),critical:z.boolean().optional()});

export const modelIntentSchema=z.object({
  schemaVersion:z.literal(1).default(1),
  domain:z.enum(["filesystem","unknown"]),
  intent:z.enum(["create","read","update","delete","find","list","open","execute","unknown"]),
  operation:z.enum(["find_file","list_files","search_files","create_folder","create_text_file","read_file","write_text_file","copy_file","move_file","rename_file","trash_file","file_info","unknown"]),
  entities:z.record(primitiveEntitySchema).default({}),
  referencesPreviousResult:z.boolean().default(false),
  ambiguities:z.array(ambiguitySchema).default([]),
  missing:z.array(z.string()).default([]),
  modelConfidence:z.number().min(0).max(1).default(.8)
});

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

function operationVariant(operation:string,intent:string,requiredEntities:string[],description:string){
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
      entities:{
        type:"object",
        additionalProperties:false,
        required:requiredEntities,
        properties:entityProperties
      }
    }
  };
}

export const modelIntentJsonSchema={
  oneOf:[
    operationVariant("create_folder","create",["name","folder"],"Criar uma pasta ou diretório. Exemplos: crie a pasta teste em downloads; faça uma pastinha Projetos nos meus downloads."),
    operationVariant("create_text_file","create",["name","folder"],"Criar um arquivo textual. content pode ser incluído quando o usuário fornecer conteúdo."),
    operationVariant("write_text_file","update",["file","content"],"Alterar, editar, substituir ou escrever o conteúdo de um arquivo existente."),
    operationVariant("find_file","find",["name"],"Localizar um arquivo específico por nome. folder é opcional quando o usuário informa escopo."),
    operationVariant("search_files","find",["query"],"Pesquisar arquivos por termo ou critério. Não use para localizar um nome de arquivo explícito quando find_file se aplica."),
    operationVariant("list_files","list",["folder"],"Listar ou mostrar o conteúdo/arquivos de uma pasta."),
    operationVariant("read_file","read",["path"],"Ler o conteúdo de um arquivo quando um path explícito foi fornecido."),
    operationVariant("file_info","read",["path"],"Obter informações de um arquivo identificado por path."),
    operationVariant("copy_file","update",["source","destination"],"Copiar arquivo entre caminhos explícitos."),
    operationVariant("move_file","update",["source","destination"],"Mover arquivo entre caminhos explícitos."),
    operationVariant("rename_file","update",["path","newName"],"Renomear um arquivo identificado por path."),
    operationVariant("trash_file","delete",["path"],"Mover arquivo identificado por path para a lixeira."),
    {
      type:"object",
      description:"Use SOMENTE para pedido não executável em filesystem: pergunta informacional, ação explicitamente negada, domínio diferente ou pedido realmente impossível de classificar.",
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
