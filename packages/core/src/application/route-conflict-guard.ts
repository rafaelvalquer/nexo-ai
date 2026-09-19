import type { CommandRoute } from "./command-service.js";

const READ_ONLY=new Set(["find_file","search_files","list_files","file_info","read_file","largest_files"]);
const MUTATION=/\b(?:crie|criar|cria|faça|fazer|gere|gerar|edite|editar|altere|alterar|troque|mude|mudar|modifique|modificar|substitua|escreva|escrever|apague|apagar|delete|mova|mover|renomeie|renomear|salve|salvar)\b/iu;
const EXPLICIT_READ=/\b(?:procure|procurar|pesquise|pesquisar|busque|buscar|encontre|encontrar|localize|ache|liste|listar|mostre|mostrar|veja|ver|leia|ler|consulte|consultar|analise|analisar)\b/iu;

export type RouteConflictDecision={accepted:true}|{accepted:false;reason:"read_vs_mutation"};

export class RouteConflictGuard{
  evaluate(text:string,route:CommandRoute):RouteConflictDecision{
    if(route.type!=="tool"||!READ_ONLY.has(route.tool))return{accepted:true};
    // A read tool may be the deterministic discovery step of a mutation plan.
    // It is safe to accept only when the mutation is explicitly carried as a
    // deferred action; an isolated read candidate still conflicts.
    if(route.deferredAction)return{accepted:true};
    if(hasMutationEvidence(text)&&!isExplicitReadRequest(text))return{accepted:false,reason:"read_vs_mutation"};
    return{accepted:true};
  }
}

export function hasMutationEvidence(text:string){return MUTATION.test(text);}
export function isExplicitReadRequest(text:string){return EXPLICIT_READ.test(text)&&!MUTATION.test(text);}
export function isReadOnlyCandidate(route:CommandRoute){return route.type==="tool"&&READ_ONLY.has(route.tool);}
