import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { ResourceAction, ResourceItem } from "@nexo/shared";
import type { PresentationAdapter } from "../types.js";

const fileSchema = z.object({ name: z.string(), path: z.string(), type: z.enum(["file", "directory"]).optional(), size: z.number().optional(), modifiedAt: z.string().optional(), childCount:z.number().optional() });
export function fileActions(folder: boolean): ResourceAction[] {
  return [
    ...(folder ? [{ id: "folder.list", icon: "list", label: "Listar pasta", mutation: false }, { id: "folder.search", icon: "search", label: "Pesquisar na pasta", mutation: false }] as ResourceAction[] : [{ id: "file.preview", icon: "preview", label: "Visualizar", mutation: false }] as ResourceAction[]),
    { id: "file.open_folder", icon: "open", label: "Abrir pasta", mutation: false },
    ...(!folder ? [{id:"file.open",icon:"open",label:"Abrir externamente",mutation:false}] as ResourceAction[] : []),
    { id: "file.rename", icon: "edit", label: "Renomear", mutation: true },
    { id: "file.move", icon: "move", label: "Mover", mutation: true },
    { id: "file.trash", icon: "trash", label: "Mover para a lixeira", mutation: true },
    { id: "file.copy_path", icon: "copy", label: "Copiar caminho", mutation: false },
  ];
}
export const filesystemAdapter: PresentationAdapter = (result, context) => {
  const findResult = z.object({ matches: z.array(z.object({ name:z.string(),path:z.string(),root:z.string().optional(),size:z.number().optional(),modifiedAt:z.string().optional() })) }).safeParse(result.data);
  if(findResult.success){const blockId=randomUUID();const items:ResourceItem[]=findResult.data.matches.map(file=>({id:randomUUID(),resource:{kind:"file",path:file.path,name:file.name,extension:path.extname(file.name).slice(1),size:file.size,modifiedAt:file.modifiedAt},actions:fileActions(false)}));return{presentation:{version:1,blocks:[{id:blockId,version:1,type:"resource_collection",domain:"filesystem",title:"Arquivo encontrado",total:items.length,items}]},bindings:items.map(item=>({blockId,itemId:item.id,toolName:context.toolName,input:{path:item.resource.kind==="file"?item.resource.path:undefined}}))};}
  const largest = z.object({ files: z.array(z.unknown()) }).safeParse(result.data);
  const rows = largest.success ? largest.data.files : result.data;
  const parsed = z.array(fileSchema).safeParse(rows);
  if (!parsed.success) return undefined;
  const blockId = randomUUID();
  const items: ResourceItem[] = parsed.data.map(file => ({ id: randomUUID(), resource: { kind: file.type === "directory" ? "folder" : "file", path: file.path, name: file.name, extension: path.extname(file.name).slice(1), size: file.size, modifiedAt: file.modifiedAt,childCount:file.childCount }, actions: fileActions(file.type === "directory") }));
  return {
    presentation: { version: 1, blocks: [{ id: blockId, version: 1, type: "resource_collection", domain: "filesystem", title: "Arquivos e pastas", total: items.length, items }] },
    bindings: items.map(item => ({ blockId, itemId: item.id, toolName: context.toolName, input: { path: item.resource.kind === "file" || item.resource.kind === "folder" ? item.resource.path : undefined } })),
  };
};
