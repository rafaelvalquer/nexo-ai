import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { MemoryService } from "../../memory/index.js";

export function memoryTools(service: MemoryService): ToolDefinition[] {
  return [
    {
      name: "memory_save",
      description: "Salva uma informação útil na memória local somente quando o usuário pede explicitamente para lembrar, guardar ou salvar algo.",
      risk: "SAFE_WRITE",
      permissions: ["memory.write"],
      mutatesState:true,mutationSafety:{idempotency:"nexo",reconciliation:"none"},agent:{category:"memory",outputTrust:"sensitive_local"},
      inputSchema: z.object({
        key: z.string().min(1).describe("Chave normalizada, ex: user.name, project.tavernquest.path"),
        value: z.string().min(1).describe("Valor a salvar"),
        category: z.enum(["profile", "preference", "project", "location", "application", "workflow", "other"]).optional().default("other")
      }),
      async execute({ key, value, category }) {
        try {
          const saved = service.save(key, value, category);
          const displayKey = saved.key.replace("user.", "").replace(/_/g, " ");
          return { ok: true, summary: `Salvei na memória:\n${displayKey}: ${saved.value}`, data: saved };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, summary: message, error: message };
        }
      }
    },
    {
      name: "memory_search",
      description: "Busca informações na memória local do usuário com base em uma chave ou valor.",
      risk: "READ",
      permissions: ["memory.read"],
      agent:{category:"memory",outputTrust:"sensitive_local"},
      inputSchema: z.object({
        query: z.string().min(1).describe("Termo de busca (chave ou valor)")
      }),
      async execute({ query }) {
        const results = service.search(query);
        if (results.length === 0) {
          return { ok: true, summary: "Não encontrei nada sobre isso na memória.", data: [] };
        }

        const formatted = results.map(r => {
          if (r.key === "user.name") return `Seu nome é ${r.value}.`;
          return `${r.key}: ${r.value}`;
        });

        return {
          ok: true,
          summary: formatted.join("\n"),
          data: results.map(r => ({ key: r.key, value: r.value, category: r.category }))
        };
      }
    },
    {
      name: "memory_list",
      description: "Lista todas as informações da memória local agrupadas por categoria.",
      risk: "READ",
      permissions: ["memory.read"],
      agent:{category:"memory",outputTrust:"sensitive_local"},
      inputSchema: z.object({}),
      async execute() {
        const grouped = service.listByCategory();
        const categories = Object.keys(grouped);
        if (categories.length === 0) {
          return { ok: true, summary: "Sua memória está vazia ou desativada.", data: {} };
        }

        const lines = categories.flatMap(category => [
          `${category}:`,
          ...grouped[category].map(item => `- ${item.key}: ${item.value}`)
        ]);
        return { ok: true, summary: lines.join("\n"), data: grouped };
      }
    },
    {
      name: "memory_delete",
      description: "Remove uma informação da memória local do usuário. Requer confirmação.",
      risk: "SENSITIVE",
      permissions: ["memory.write"],
      mutatesState:true,mutationSafety:{idempotency:"nexo",reconciliation:"none"},agent:{category:"memory",outputTrust:"sensitive_local"},
      inputSchema: z.object({
        key: z.string().min(1).describe("Chave exata da memória a remover")
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
