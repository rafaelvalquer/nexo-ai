import type { NormalizedIntentInput } from "../types.js";

export function filesystemIntentPrompt(input:NormalizedIntentInput,operations:string[]){
  return [
    "Domínio permitido nesta fase: filesystem.",
    `Operações permitidas: ${operations.join(", ")}.`,
    "Classifique somente a intenção. Não execute nada e não produza argumentos físicos de Tool.",
    "Entidades usuais: name, file, folder, path, content, query, source, destination, newName.",
    "Regras de operação:",
    "- create_folder: criar pasta/diretório; required name + folder.",
    "- create_text_file: criar arquivo textual; required name + folder; content é opcional.",
    "- find_file: localizar um arquivo específico pelo nome; required name; folder é opcional.",
    "- list_files: listar/mostrar o conteúdo de uma pasta; required folder.",
    "- search_files: pesquisar por critério/termo, não apenas localizar um nome específico; required query; folder é opcional.",
    "- write_text_file: alterar/substituir o conteúdo de um arquivo; required file + content; folder é opcional.",
    "- read_file/file_info/copy_file/move_file/rename_file/trash_file: use somente se o pedido corresponder claramente à operação e não invente paths.",
    "Locais lógicos podem ser representados por aliases simples como downloads, documents ou desktop. Nunca invente um local que o usuário não mencionou.",
    "Preserve literalmente nomes, extensões e conteúdo textual. Não corrija, resuma nem reescreva content.",
    "Quando houver marcador como 'para', 'por', 'contendo', 'com conteúdo', 'com texto' ou 'e coloque', preserve como content somente o texto solicitado após o marcador.",
    "Se uma entidade obrigatória estiver ausente, inclua o nome do campo em missing.",
    "Se o usuário disser apenas 'crie teste em downloads' sem dizer arquivo/pasta e sem extensão, declare ambiguity resource_type.",
    "Se for pergunta informacional como 'como criar uma pasta?' ou houver negação como 'não crie...', retorne intent=unknown e operation=unknown.",
    "Exemplos semânticos:",
    "'faz uma pastinha teste nos meus downloads' => create_folder; name=teste; folder=downloads.",
    "'procure teste.txt' => find_file; name=teste.txt.",
    "'encontre teste.txt em downloads' => find_file; name=teste.txt; folder=downloads.",
    "'liste downloads' => list_files; folder=downloads.",
    "'crie teste.txt em downloads com conteúdo abc' => create_text_file; name=teste.txt; folder=downloads; content=abc.",
    "'troque o conteúdo do teste123.txt por abc' => write_text_file; file=teste123.txt; content=abc.",
    "modelConfidence mede somente sua confiança semântica, entre 0 e 1.",
    `Pedido: ${input.normalized}`
  ].join("\n");
}
