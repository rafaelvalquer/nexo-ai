import path from "node:path";
import type { CanonicalIntent, IntentAmbiguity } from "./types.js";

const REQUIREMENTS:Record<string,{required:string[];optional?:string[]}>={
  create_folder:{required:["name","folder"]},
  create_text_file:{required:["name","folder"],optional:["content"]},
  write_text_file:{required:["file","content"],optional:["folder","path"]},
  find_file:{required:["name"],optional:["folder"]},
  list_files:{required:["folder"]},
  search_files:{required:["query"],optional:["folder"]},
  read_file:{required:["path"]},
  copy_file:{required:["source","destination"]},
  move_file:{required:["source","destination"]},
  rename_file:{required:["path","newName"]},
  trash_file:{required:["path"]},
  file_info:{required:["path"]}
};

export type SemanticValidationResult={
  valid:boolean;
  intent:CanonicalIntent;
  missing:string[];
  ambiguities:IntentAmbiguity[];
  reason?:string;
  question?:string;
};

export function validateIntentSemantics(intent:CanonicalIntent,userText:string):SemanticValidationResult{
  const text=userText.normalize("NFKC").trim();
  if(isInformational(text))return invalid(intent,"INFORMATIONAL_REQUEST","O pedido é informacional e não autoriza execução.");
  if(isNegatedMutation(text))return invalid(intent,"NEGATED_ACTION","O pedido contém uma negação explícita e não autoriza alteração.");

  const requirements=REQUIREMENTS[intent.operation];
  if(!requirements)return invalid(intent,"INVALID_INTENT_OPERATION","Não há requisitos semânticos registrados para a operação.");
  const missing=[...new Set([...intent.missing,...requirements.required.filter(key=>!hasEntity(intent,key))])];
  const ambiguities=[...intent.ambiguities];

  if(intent.operation==="create_folder"||intent.operation==="create_text_file"){
    const name=entityString(intent,"name");
    if(name&&unsafeLeafName(name))ambiguities.push({code:"unsafe_name",field:"name",message:"O nome deve representar apenas um arquivo ou pasta, sem caminho ou navegação relativa.",critical:true});
  }
  if(intent.operation==="rename_file"){
    const newName=entityString(intent,"newName");
    if(newName&&unsafeLeafName(newName))ambiguities.push({code:"unsafe_name",field:"newName",message:"O novo nome deve ser apenas o nome final, sem caminho.",critical:true});
  }

  if(intent.operation==="create_folder"&&isResourceTypeAmbiguous(text)){
    ambiguities.push({code:"resource_type",field:"name",message:"Não ficou claro se o recurso é arquivo ou pasta.",critical:true});
  }

  for(const key of ["path","source","destination","folder"]){
    const value=entityString(intent,key);
    if(!value||!isAbsolutePortable(value))continue;
    if(!containsLiteralPath(text,value))ambiguities.push({code:"invented_physical_path",field:key,message:"O caminho físico não aparece literalmente no pedido do usuário.",critical:true});
  }

  const next={...intent,missing,ambiguities};
  if(missing.length){
    return{valid:false,intent:next,missing,ambiguities,reason:"MISSING_REQUIRED_ENTITY",question:missingQuestion(intent.operation,missing[0])};
  }
  const critical=ambiguities.find(item=>item.critical!==false);
  if(critical){
    return{valid:false,intent:next,missing,ambiguities,reason:critical.code,question:ambiguityQuestion(critical,next)};
  }
  return{valid:true,intent:next,missing,ambiguities};
}

function hasEntity(intent:CanonicalIntent,key:string){
  const value=intent.entities[key]?.value;
  return typeof value==="string"?Boolean(value.trim()):Array.isArray(value)?value.length>0:value!==undefined;
}
function entityString(intent:CanonicalIntent,key:string){
  const value=intent.entities[key]?.value;
  return typeof value==="string"?value.trim():undefined;
}
function invalid(intent:CanonicalIntent,code:string,reason:string):SemanticValidationResult{
  return{valid:false,intent,missing:intent.missing,ambiguities:intent.ambiguities,reason:code};
}
function containsTraversal(value:string){return value.split(/[\\/]+/).some(part=>part==="."||part==="..");}
function unsafeLeafName(value:string){return containsTraversal(value)||/[\\/]/.test(value)||isAbsolutePortable(value);}
function isAbsolutePortable(value:string){return path.isAbsolute(value)||path.win32.isAbsolute(value);}
function containsLiteralPath(text:string,value:string){
  const normalize=(input:string)=>input.replace(/\//g,"\\").replace(/[\\]+/g,"\\").toLocaleLowerCase();
  return normalize(text).includes(normalize(value));
}
function isInformational(text:string){
  return /^\s*(?:como|qual(?:\s+é)?\s+a\s+forma|o\s+que\s+acontece\s+se|pode\s+me\s+explicar)\b/i.test(text)
    && /\b(?:criar|editar|alterar|apagar|mover|renomear|arquivo|pasta)\b/i.test(text);
}
function isNegatedMutation(text:string){
  return /\b(?:não|nao)\s+(?:(?:quero|precisa|deve)\s+(?:que\s+)?)?(?:crie|criar|cria|faça|fazer|gere|gerar|edite|editar|altere|alterar|mude|mudar|apague|apagar|delete|mova|mover|renomeie|renomear|escreva|escrever)\b/i.test(text);
}
function isResourceTypeAmbiguous(text:string){
  const mutation=/\b(?:crie|criar|cria|gere|gerar|faça|fazer|monte|montar)\b/i.test(text);
  // A type word inside the destination ("na pasta downloads") does not tell us
  // whether the resource being created is a file or directory. The type must
  // qualify the object immediately after the creation verb.
  const explicitObjectType=/\b(?:crie|criar|cria|gere|gerar|faça|fazer|monte|montar)\s+(?:(?:um|uma|o|a)\s+)?(?:pastinha|pasta|diret[oó]rio|arquivo|documento)\b/i.test(text);
  const extension=/\.[a-z0-9]{1,12}\b/i.test(text);
  return mutation&&!explicitObjectType&&!extension;
}
function missingQuestion(operation:string,field:string){
  if(field==="content")return"Qual conteúdo deve ser gravado no arquivo?";
  if(field==="folder")return"Em qual pasta devo executar essa ação?";
  if(field==="name"||field==="file")return"Qual é o nome do arquivo ou pasta?";
  return`Preciso do campo ${field} para continuar com ${operation}.`;
}
function ambiguityQuestion(ambiguity:IntentAmbiguity,intent:CanonicalIntent){
  if(ambiguity.code==="resource_type"){
    const name=entityString(intent,"name")??"esse recurso";
    const folder=entityString(intent,"folder");
    return`Você quer criar uma pasta ou um arquivo chamado "${name}"${folder?` em ${folder}`:""}?`;
  }
  return ambiguity.message;
}
