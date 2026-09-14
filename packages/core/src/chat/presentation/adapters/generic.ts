import { randomUUID } from "node:crypto";
import type { GenericResource } from "@nexo/shared";
import type { PresentationAdapter } from "../types.js";

/** Register an explicit safe projection instead of enumerating arbitrary tool data. */
export function genericAdapter(project: (data: unknown) => GenericResource[] | undefined, title: string): PresentationAdapter {
  return result => {
    const resources = project(result.data);
    if (!resources) return undefined;
    return { presentation: { version: 1, blocks: [{ version: 1, id: randomUUID(), type: "resource_collection", domain: "generic", title, total: resources.length, items: resources.map(resource => ({ id: randomUUID(), resource, actions: [] })) }] }, bindings: [] };
  };
}

/** Default registered projection exposes only the array length and existing textual summary. */
export const safeArraySummaryAdapter:PresentationAdapter = result => {
  if(!Array.isArray(result.data))return undefined;
  return {presentation:{version:1,blocks:[{id:randomUUID(),version:1,type:"resource_collection",domain:"generic",title:"Resultado da ferramenta",items:[{id:randomUUID(),resource:{kind:"generic",title:`${result.data.length} item(ns) retornado(s)`,description:result.summary},actions:[]}]}]},bindings:[]};
};
