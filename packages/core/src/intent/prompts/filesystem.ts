import type { NormalizedIntentInput } from "../types.js";

export function filesystemIntentPrompt(input:NormalizedIntentInput,operations:string[]){
  const literalContent=input.literalSegments.find(segment=>segment.type==="content")?.value;
  return [
    "Classifique o pedido em UMA intenção de filesystem usando somente o schema fornecido.",
    `Operações permitidas: ${operations.join(", ")}.`,
    "Não invente entidades obrigatórias ausentes. Se faltar name, folder, file, content, path, source ou destination: omita a entidade e liste o campo em missing.",
    "O Core calcula missing novamente; sua função é preservar somente o que está no pedido.",
    "Mapa:",
    "- criar pasta/diretório/pastinha => create_folder.",
    "- criar arquivo textual => create_text_file.",
    "- editar/alterar/trocar/substituir conteúdo => write_text_file.",
    "- procurar/localizar/encontrar nome de arquivo explícito => find_file.",
    "- pesquisar/buscar por termo ou critério => search_files.",
    "- listar/mostrar conteúdo de uma pasta => list_files.",
    "Aliases: download/downloads/meus downloads => downloads; documento/documentos/meus documentos => documents; área de trabalho/desktop => desktop.",
    "Escopo explícito desconhecido deve ser preservado literalmente em folder. Não o converta em alias conhecido.",
    "NUNCA invente path/source/destination. Caminho físico só pode aparecer se estiver literalmente no pedido.",
    "Pergunta informacional ou ação negada => unknown.",
    "Se o tipo do recurso não estiver claro entre arquivo e pasta, registre ambiguity e não adivinhe.",
    literalContent!==undefined?`Conteúdo literal extraído pelo Core; copie exatamente para entities.content: ${JSON.stringify(literalContent)}`:"Nenhum conteúdo literal pré-extraído.",
    "Preserve nomes, extensões, números, pontuação, moeda, acentos e conteúdo sem traduzir ou reescrever.",
    `Pedido normalizado: ${input.routingText}`,
    `Pedido original: ${input.original}`
  ].join("\n");
}
