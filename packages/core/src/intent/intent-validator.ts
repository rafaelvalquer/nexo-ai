import {intentOperationContracts} from "./operation-contracts.js";
import type {CanonicalIntent} from "./types.js";

export type IntentValidationResult={valid:true;intent:CanonicalIntent}|{valid:false;code:string;reason:string};

export function validateCanonicalIntent(intent:CanonicalIntent,availableOperations:string[],allowedDomains?:string[]):IntentValidationResult{
 if(intent.schemaVersion!==1)return{valid:false,code:"INVALID_INTENT_SCHEMA",reason:"Versão de schema não suportada."};
 if(intent.operation==="unknown"){
  if(intent.domain!=="unknown"||intent.intent!=="unknown")return{valid:false,code:"INVALID_UNKNOWN_INTENT",reason:"Intent unknown deve usar domínio e ação unknown."};
  return{valid:true,intent};
 }
 const contract=intentOperationContracts[intent.operation];
 if(!contract)return{valid:false,code:"INVALID_INTENT_OPERATION",reason:`Operação não registrada: ${intent.operation}.`};
 if(!availableOperations.includes(intent.operation))return{valid:false,code:"INVALID_INTENT_OPERATION",reason:`Operação não permitida: ${intent.operation}.`};
 if(allowedDomains?.length&&!allowedDomains.includes(contract.domain))return{valid:false,code:"INVALID_INTENT_DOMAIN",reason:`Domínio não permitido: ${contract.domain}.`};
 if(intent.domain!==contract.domain)return{valid:false,code:"INVALID_INTENT_DOMAIN",reason:`A operação ${intent.operation} pertence ao domínio ${contract.domain}, não ${intent.domain}.`};
 if(intent.intent!==contract.intent)return{valid:false,code:"INVALID_INTENT_ACTION",reason:`A ação de ${intent.operation} deve ser ${contract.intent}.`};
 const allowed=new Set(contract.allowedEntities);
 const invalidEntity=Object.keys(intent.entities).find(key=>!allowed.has(key));
 if(invalidEntity)return{valid:false,code:"INVALID_INTENT_ENTITY",reason:`Entidade não permitida para ${intent.operation}: ${invalidEntity}.`};
 return{valid:true,intent};
}
