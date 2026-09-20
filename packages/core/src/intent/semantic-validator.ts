import path from "node:path";
import {deriveMissingFields,sanitizeDeclaredMissing} from "./operation-requirements.js";
import type { CanonicalIntent, IntentAmbiguity } from "./types.js";

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

  const derivedMissing=deriveMissingFields(intent.operation,intent.entities);
  if(!derivedMissing.length&&!isKnownOperation(intent.operation))return invalid(intent,"INVALID_INTENT_OPERATION","Não há requisitos semânticos registrados para a operação.");
  const missing=[...new Set([...sanitizeDeclaredMissing(intent.operation,intent.missing),...derivedMissing])];
  const ambiguities=[...intent.ambiguities];

  for(const key of ["folder","path","source","destination"]){
    const entity=intent.entities[key];
    if(entity?.source==="inferred"&&!missing.includes(key)){
      missing.push(key);
      ambiguities.push({code:"untrusted_inferred_location",field:key,message:"O local não foi informado literalmente nem derivado de contexto validado.",critical:true});
    }
  }

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

  const next={...intent,missing:[...new Set(missing)],ambiguities};
  if(next.missing.length){
    return{valid:false,intent:next,missing:next.missing,ambiguities,reason:"MISSING_REQUIRED_ENTITY",question:missingQuestion(intent.operation,next.missing[0])};
  }
  const critical=ambiguities.find(item=>item.critical!==false);
  if(critical){
    return{valid:false,intent:next,missing:next.missing,ambiguities,reason:critical.code,question:ambiguityQuestion(critical,next)};
  }
  return{valid:true,intent:next,missing:next.missing,ambiguities};
}

function isKnownOperation(operation:string){
  return ["create_folder","create_text_file","write_text_file","find_file","list_files","search_files","read_file","copy_file","move_file","rename_file","trash_file","file_info"].includes(operation);
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
