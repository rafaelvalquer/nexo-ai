import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { MemoryService } from "../../memory/index.js";

export function memoryTools(service: MemoryService): ToolDefinition[] {
  return [
    {
      name: "memory_save",
      description: "Salva uma informação útil na memória local do usuário.",
      risk: "SAFE_WRITE",
      permissions: ["memory.write"],
      inputSchema: z.object({
        key: z.string().describe("Chave normalizada, ex: user.name, project.tavernquest.path"),
        value: z.string().describe("Valor a salvar"),
        category: z.string().optional().default("other").describe("profile | preference | project | location | application | workflow | other")
      }),
      async execute({ key, value, category }) {
        try {
          service.save(key, value, category);
          const displayKey = key.replace("user.", "").replace(/_/g, " ");
          return { ok: true, summary: `Salvei na memória:\n${displayKey}: ${value}` };
        } catch (e: any) {
          return { ok: false, summary: e.message };
        }
      }
    },
    {
      name: "memory_search",
      description: "Busca informações na memória local do usuário com base em uma query.",
      risk: "READ",
      permissions: ["memory.read"],
      inputSchema: z.object({
        query: z.string().describe("Termo de busca (chave ou valor)")
      }),
      async execute({ query }) {
        const results = service.search(query);
        if (results.length === 0) {
          return { ok: true, summary: "Não encontrei nada sobre isso na memória.", data: [] };
        }
        return {
          ok: true,
          summary: `${results.length} memória(s) encontrada(s)`,
          data: results.map(r => ({ key: r.key, value: r.value, category: r.category }))
        };
      }
    },
    {
      name: "memory_list",
      description: "Lista todas as informações da memória local agrupadas por categoria.",
      risk: "READ",
      permissions: ["memory.read"],
      inputSchema: z.object({}),
      async execute() {
        const grouped = service.listByCategory();
        const categories = Object.keys(grouped);
        if (categories.length === 0) {
          return { ok: true, summary: "Sua memória está vazia.", data: {} };
        }
        return { ok: true, summary: `${categories.length} categoria(s) na memória`, data: grouped };
      }
    },
    {
      name: "memory_delete",
      description: "Remove uma informação da memória local do usuário. Requer confirmação.",
      risk: "SENSITIVE",
      permissions: ["memory.write"],
      inputSchema: z.object({
        key: z.string().describe("Chave exata da memória a remover")
      }),
      async execute({ key }) {
        const found = service.search(key);
        if (found.length === 0) {
          return { ok: false, summary: `Não encontrei memória com a chave '${key}'.` };
        }
        service.remove(key);
        return { ok: true, summary: `Memória '${key}' removida com sucesso.` };
      }
    }
  ];
}
