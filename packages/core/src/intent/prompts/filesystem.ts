import type { NormalizedIntentInput } from "../types.js";

export function filesystemIntentPrompt(input:NormalizedIntentInput,operations:string[]){
  return [
    "Domínio permitido nesta fase: filesystem.",
    `Operações permitidas: ${operations.join(", ")}.`,
    "Entidades usuais: name, file, folder, path, content, query, source, destination, newName.",
    "Para create_folder extraia name e folder. Para create_text_file extraia name, folder e content quando houver.",
    "Para write_text_file extraia file e content; não invente a pasta se ela não foi informada.",
    "Se o usuário disser apenas 'crie teste em downloads' sem dizer arquivo/pasta e sem extensão, declare ambiguity resource_type.",
    "Se for pergunta como 'como criar uma pasta?' ou houver negação como 'não crie...', retorne intent=unknown, operation=unknown.",
    "modelConfidence mede somente sua confiança semântica, entre 0 e 1.",
    `Pedido: ${input.normalized}`
  ].join("\n");
}
