import type { NormalizedIntentInput } from "../types.js";

export function filesystemIntentPrompt(input:NormalizedIntentInput,operations:string[]){
  const literalContent=input.literalSegments.find(segment=>segment.type==="content")?.value;
  return [
    "Classifique o pedido em UMA intenção de filesystem usando somente o schema fornecido.",
    `Operações atualmente permitidas: ${operations.join(", ")}.`,
    "Pedidos para criar/listar/procurar/pesquisar/editar arquivos ou pastas SÃO filesystem; não retorne unknown para esses pedidos.",
    "Mapa principal:",
    "- criar pasta, diretório ou pastinha => create_folder; copie name e folder do pedido.",
    "- criar arquivo .txt ou arquivo textual => create_text_file; copie name, folder e content quando houver.",
    "- editar, alterar, trocar, substituir ou escrever conteúdo => write_text_file; copie file e content literalmente.",
    "- procurar/localizar/encontrar um nome de arquivo explícito => find_file; copie name; folder é opcional.",
    "- pesquisar/buscar arquivos por termo ou critério => search_files; copie query; folder é opcional.",
    "- listar/mostrar arquivos ou conteúdo de uma pasta => list_files; copie folder.",
    "Aliases de local: download/downloads/meus downloads => downloads; documento/documentos/meus documentos => documents; área de trabalho/desktop => desktop.",
    "Se o usuário mencionar um escopo desconhecido, preserve o texto em folder; não invente caminho físico.",
    "NUNCA invente path/source/destination. Só use caminho físico quando estiver literalmente escrito pelo usuário.",
    "unknown SOMENTE para pergunta informacional, ação negada, domínio não-filesystem ou pedido realmente não classificável.",
    "Se o objeto a criar não deixa claro arquivo versus pasta, use unknown ou registre ambiguity; não adivinhe.",
    literalContent!==undefined?`Conteúdo literal já extraído pelo Core; copie exatamente para entities.content: ${JSON.stringify(literalContent)}`:"Não há conteúdo literal pré-extraído.",
    "Preserve literalmente nomes, extensões e conteúdo. Não reescreva o conteúdo do usuário.",
    `Pedido normalizado: ${input.routingText}`,
    `Pedido original: ${input.original}`
  ].join("\n");
}
