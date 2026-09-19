import type { NormalizedIntentInput } from "../types.js";

export function filesystemIntentPrompt(input:NormalizedIntentInput,operations:string[]){
  const literalContent=input.literalSegments.find(segment=>segment.type==="content")?.value;
  return [
    "Domínio executável permitido nesta fase: filesystem. Se não for filesystem, use domain=unknown, intent=unknown, operation=unknown.",
    `Operações permitidas: ${operations.join(", ")}.`,
    "Classifique somente a intenção. Não execute nada e não produza argumentos físicos de Tool.",
    "Entidades usuais: name, file, folder, path, content, query, source, destination, newName.",
    "Regras de operação:",
    "- create_folder: criar pasta/diretório; required name + folder.",
    "- create_text_file: criar arquivo textual; required name + folder; content é opcional.",
    "- find_file: localizar arquivo específico pelo nome; required name; folder é opcional.",
    "- list_files: listar/mostrar conteúdo de uma pasta; required folder.",
    "- search_files: pesquisar por critério/termo; required query; folder é opcional.",
    "- write_text_file: alterar/substituir conteúdo de arquivo; required file + content; folder é opcional.",
    "Alteração de conteúdo NUNCA termina em find_file. Retorne write_text_file; find_file será planejado posteriormente pelo Core quando necessário.",
    "Locais lógicos podem ser aliases simples como downloads, documents ou desktop.",
    "Se o usuário mencionar um escopo explícito desconhecido, preserve exatamente esse texto em folder para o Core rejeitar/clarificar; nunca descarte o escopo.",
    "Preserve nomes, extensões e content. Não corrija, resuma nem reescreva conteúdo.",
    literalContent!==undefined?`Conteúdo literal extraído pelo Core (copie exatamente para entities.content quando aplicável): ${JSON.stringify(literalContent)}`:"Nenhum segmento literal de conteúdo foi extraído pelo Core.",
    "Se faltar entidade obrigatória, inclua o campo em missing.",
    "Se disser apenas 'crie teste em downloads' sem tipo/extensão, declare ambiguity resource_type.",
    "Se disser 'faz um teste aí nos downloads' e não houver tipo claro, declare ambiguity resource_type/action_type.",
    "Pergunta informacional ou ação negada => intent=unknown, operation=unknown.",
    "Exemplos:",
    "'faz uma pastinha chamada teste nos meus downloads' => create_folder; name=teste; folder=downloads.",
    "'será que dá pra fazer uma pastinha chamada Experimentos lá nos meus downloads?' => create_folder; name=Experimentos; folder=downloads.",
    "'procure teste.txt' => find_file; name=teste.txt.",
    "'procure teste.txt na minha pasta documentos secretos' => find_file; name=teste.txt; folder=documentos secretos.",
    "'liste downloads' => list_files; folder=downloads.",
    "'crie teste.txt em downloads com conteúdo abc' => create_text_file; name=teste.txt; folder=downloads; content=abc.",
    "'troque o conteúdo do teste123.txt por abc 123' => write_text_file; file=teste123.txt; content=abc 123.",
    "'edite teste123.txt e coloque Cliente XPTO' => write_text_file; file=teste123.txt; content=Cliente XPTO.",
    "modelConfidence mede somente confiança semântica entre 0 e 1.",
    `Routing text: ${input.routingText}`,
    `Original text: ${input.original}`
  ].join("\n");
}
