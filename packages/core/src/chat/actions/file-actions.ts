import path from "node:path";
import { z } from "zod";
import type { ChatActionRegistry } from "./registry.js";

export function registerFileActions(registry: ChatActionRegistry) {
  for (const action of ["trash", "rename", "move"] as const) registry.register(`file.${action}`, ({request, item}) => {
    if (item.resource.kind !== "file" && item.resource.kind !== "folder") throw new Error("O recurso não é um arquivo.");
    const source = item.resource.path;
    let destination: string | undefined;
    if (action === "rename") {
      const name = z.string().trim().min(1).max(255).parse(request.values?.newName);
      if (/[\\/:*?"<>|]/.test(name) || name === "." || name === "..") throw new Error("Nome de arquivo inválido.");
      destination = path.join(path.dirname(source), name);
    } else if (action === "move") destination = path.join(z.string().min(1).parse(request.values?.destination), path.basename(source));
    const tool = action === "trash" ? "trash_file" : action === "rename" ? "rename_file" : "move_file";
    const input = action === "trash" ? {path: source} : action === "rename" ? {path: source, newPath: destination} : {source, destination};
    const successText = action === "trash" ? "Movido para a lixeira" : action === "rename" ? "Renomeado" : "Movido";
    return {mutation: true, successText, preflight: {tool: "file_info", input: {path: source}}, steps: [{tool, input, approval: {domain: "filesystem", actionType: action, affectedCount: 1, preview: `${source}${destination ? `\nDestino: ${destination}` : ""}`, consequence: `${item.resource.name}: ${successText.toLowerCase()}.`}}]};
  });
  for (const action of ["list", "search"] as const) registry.register(`folder.${action}`, ({request, item}) => {
    if (item.resource.kind !== "folder") throw new Error("O recurso não é uma pasta.");
    return {mutation: false, mode: "list", successText: "Pasta carregada", steps: [{tool: action === "list" ? "list_files" : "search_files", input: {path: item.resource.path, ...(action === "search" ? {query: z.string().trim().min(1).parse(request.values?.query)} : {})}}]};
  });
  registry.register("file.preview", ({item}) => {
    if (item.resource.kind !== "file") throw new Error("O recurso não é um arquivo.");
    return {mutation: false, mode: "preview", successText: "Arquivo carregado", steps: [{tool: "read_file", input: {path: item.resource.path, maxChars: 30000}}]};
  });
}
