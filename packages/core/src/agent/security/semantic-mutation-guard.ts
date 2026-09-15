const MUTATION=/\b(apagu(?:e|ar)|delete|deletar|excluir|arquiv(?:e|ar)|archive|marque\s+como\s+(?:n[aã]o\s+)?lido|envie|enviar|send|crie|criar|create|mova|mover|move|renome(?:ie|ar)|rename|edite|editar|update|atualize|cancele|cancelar|trash|lixeira|digite|clique)\b/i;
const READ=/\b(liste|listar|leia|ler|mostre|mostrar|busque|buscar|procure|pesquise|resuma|resumir|inspecione|descreva|compare|qual|quais|quanto|agenda)\b/i;
export function hasExplicitMutationVerb(text:string){return MUTATION.test(text);}
export function isSemanticallyReadOnly(text:string){return READ.test(text)&&!hasExplicitMutationVerb(text);}
export function semanticMutationAllowed(text:string|undefined){return !text||!isSemanticallyReadOnly(text);}
