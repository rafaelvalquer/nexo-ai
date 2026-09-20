import {intentOperationContracts} from "../operation-contracts.js";
import type {NormalizedIntentInput} from "../types.js";

export function unifiedIntentPrompt(input:NormalizedIntentInput,operations:string[],allowedDomains?:string[]){
 const operationRules=operations.map(operation=>{
  const contract=intentOperationContracts[operation];if(!contract)return undefined;
  return `- ${operation} [${contract.domain}/${contract.intent}] required={${contract.requiredEntities.join(",")}} optional={${contract.optionalEntities.join(",")}}`;
 }).filter(Boolean).join("\n");
 const literals=input.literalSegments.map(segment=>({type:segment.type,value:segment.value}));
 return[
  "Classifique o pedido em UMA intenção estruturada. Não escolha nem execute Tool.",
  allowedDomains?.length?`Domínios permitidos: ${allowedDomains.join(", ")}.`:"Use apenas domínios presentes nas operações permitidas.",
  `Operações permitidas: ${operations.join(", ")}.`,
  "Escolha somente uma operação registrada abaixo e use apenas as entidades permitidas pelo contrato.",
  operationRules,
  "Nunca invente paths, URLs, e-mails, IDs, nomes, datas ou conteúdo. Se uma entidade obrigatória não estiver explícita ou validada por contexto, omita-a e liste-a em missing.",
  "Filename, path, URL, e-mail, texto entre aspas e conteúdo literal devem permanecer exatamente como digitados.",
  "Aliases estruturais podem ser normalizados: download/downloads => downloads; documentos/documents => documents; área de trabalho/desktop => desktop.",
  "Pergunta informacional sem ação executável, negação explícita ou pedido fora da allowlist => operation=unknown, domain=unknown, intent=unknown.",
  "Se houver ambiguidade real, registre em ambiguities e reduza modelConfidence; não escolha uma ação aleatória.",
  `Literais protegidos pelo Core: ${JSON.stringify(literals)}`,
  `Texto de routing normalizado: ${input.routingText}`,
  `Pedido original: ${input.original}`
 ].join("\n");
}
