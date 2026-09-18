import { filesystemOperations, type CanonicalIntent } from "./types.js";

export type IntentValidationResult={valid:true;intent:CanonicalIntent}|{valid:false;code:string;reason:string};

export function validateCanonicalIntent(intent:CanonicalIntent,availableOperations:string[]):IntentValidationResult{
  if(intent.schemaVersion!==1)return{valid:false,code:"INVALID_INTENT_SCHEMA",reason:"Versão de schema não suportada."};
  if(intent.domain!=="filesystem")return{valid:false,code:"INVALID_INTENT_DOMAIN",reason:"O Hybrid Intent V1 está limitado ao domínio filesystem."};
  const allowed=new Set(filesystemOperations.filter(operation=>availableOperations.includes(operation)));
  if(!allowed.has(intent.operation as any))return{valid:false,code:"INVALID_INTENT_OPERATION",reason:`Operação não permitida: ${intent.operation}.`};
  return{valid:true,intent};
}
