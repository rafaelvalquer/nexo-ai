import type { NormalizedIntentInput } from "../intent/types.js";

export type PreRoutingSafetyDecision =
  | { terminal:false; status:"clear" }
  | { terminal:true; status:"negated"; reason:"NEGATED_ACTION"; response:string }
  | { terminal:true; status:"informational"; reason:"INFORMATIONAL_REQUEST"; stream:true }
  | { terminal:true; status:"traversal"; reason:"UNSAFE_RESOURCE_NAME"; response:string };

const MUTATION=/(?:\b(?:crie|criar|cria|faça|fazer|gere|gerar|edite|editar|altere|alterar|troque|mude|mudar|modifique|modificar|substitua|escreva|escrever|apague|apagar|delete|mova|mover|renomeie|renomear|salve|salvar)\b)/iu;
const FILESYSTEM=/\b(?:arquivos?|pastas?|pastinha|diret[oó]rios?|downloads?|documentos?|documents?|desktop|conte[uú]do)\b|\.[a-z0-9]{1,12}\b/iu;

export class PreRoutingSafetyGuard{
  evaluate(input:NormalizedIntentInput):PreRoutingSafetyDecision{
    const text=input.routingText;
    if(isNegatedMutation(text))return{terminal:true,status:"negated",reason:"NEGATED_ACTION",response:"Nenhuma ação foi executada."};
    if(isInformational(text))return{terminal:true,status:"informational",reason:"INFORMATIONAL_REQUEST",stream:true};
    if(MUTATION.test(text)&&hasTraversal(input))return{terminal:true,status:"traversal",reason:"UNSAFE_RESOURCE_NAME",response:'Não posso usar navegação relativa como ".." ou "." no nome ou caminho solicitado.'};
    return{terminal:false,status:"clear"};
  }
}

export function isNegatedMutation(text:string){
  return /\b(?:não|nao)\s+(?:(?:quero|precisa|deve)\s+(?:que\s+)?)?(?:crie|criar|cria|faça|fazer|gere|gerar|edite|editar|altere|alterar|troque|mude|mudar|modifique|modificar|substitua|escreva|escrever|apague|apagar|delete|mova|mover|renomeie|renomear|salve|salvar)\b/iu.test(text);
}

export function isInformational(text:string){
  if(!FILESYSTEM.test(text))return false;
  return /^\s*(?:como\b|como\s+faço\b|como\s+faco\b|qual\s+(?:é|e)\s+a\s+forma\b|qual\s+a\s+forma\b|me\s+explique\b|pode\s+me\s+explicar\b|o\s+que\s+acontece\s+se\b)/iu.test(text);
}

function hasTraversal(input:NormalizedIntentInput){
  const contentStart=input.literalSegments.filter(segment=>segment.type==="content").map(segment=>segment.start).sort((a,b)=>a-b)[0];
  const operational=contentStart===undefined?input.original:input.original.slice(0,contentStart);
  return /(?:^|[\s"'\\/])\.\.(?:[\\/]|\b|$)/u.test(operational)
    ||/(?:^|[\s"'\\/])\.(?=\s+(?:em|no|na|nos|nas|para|dentro)|\s*$)/iu.test(operational);
}
