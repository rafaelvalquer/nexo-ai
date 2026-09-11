import path from "node:path";
import os from "node:os";
import type { Plan } from "./planner.js";

function expandKnownPaths(text: string) {
  return text
    .replace(/\bDownloads\b/gi, path.join(os.homedir(), "Downloads"))
    .replace(/\bDocumentos\b/gi, path.join(os.homedir(), "Documents"))
    .replace(/\bDesktop\b/gi, path.join(os.homedir(), "Desktop"));
}

export class FastIntentRouter {
  route(text: string): Plan | null {
    const normalized = text.toLowerCase();

    // Diagnóstico
    if (/computador.*lento|pc.*lento/.test(normalized)) {
      return {
        steps: [
          { tool: "system_info", input: {}, explanation: "Coletando informações do sistema…" },
          { tool: "memory_usage", input: {}, explanation: "Verificando uso de memória…" },
          { tool: "disk_usage", input: {}, explanation: "Verificando espaço em disco…" },
          { tool: "process_list", input: { limit: 12 }, explanation: "Analisando processos em execução…" }
        ]
      };
    }
    if (/uso.*mem[oó]ria|mem[oó]ria.*uso/.test(normalized)) {
      return { tool: "memory_usage", input: {}, explanation: "Verificando o uso de memória…" };
    }
    if (/uso.*disco|disco.*ocupado/.test(normalized)) {
      return { tool: "disk_usage", input: {}, explanation: "Verificando o uso dos discos…" };
    }

    // Aplicações
    const app = text.match(/\babra\s+(?:o\s+)?(chrome|google chrome|edge|microsoft edge|vscode|visual studio code|android studio|explorer)\b/i);
    if (app) {
      return { tool: "open_application", input: { application: app[1] }, explanation: `Abrindo ${app[1]}…` };
    }

    // Arquivos
    const list = text.match(/(?:liste|mostre|ver)\s+(?:os\s+)?arquivos.*?(Downloads|Documentos|Desktop|[A-Za-z]:\\[^\n]+)/i);
    if (list) {
      return { tool: "list_files", input: { path: expandKnownPaths(list[1]) }, explanation: "Listando os arquivos solicitados…" };
    }

    const search = text.match(/(?:encontre|procure|pesquise).*?([^\s]+\.(?:pdf|docx?|xlsx?|txt|jpg|png)|pdfs?|arquivos?).*?(?:em|na pasta)?\s*(Downloads|Documentos|Desktop)?/i);
    if (search && search[2]) {
      return { tool: "search_files", input: { path: expandKnownPaths(search[2]), query: search[1].replace(/s$/i, "") }, explanation: "Pesquisando os arquivos…" };
    }

    // Memória - memory_save
    const saveMatch = text.match(/meu\s+nome\s+[eé]\s+([^,.]+).*?salv[ea]\s+isso/i);
    if (saveMatch) {
      return { tool: "memory_save", input: { key: "user.name", value: saveMatch[1].trim(), category: "profile" }, explanation: "Salvando seu nome na memória…" };
    }

    // Memória - memory_search
    const searchName = text.match(/qual\s+[eé]\s+meu\s+nome/i);
    if (searchName) {
      return { tool: "memory_search", input: { query: "user.name" }, explanation: "Buscando seu nome na memória…" };
    }

    // Memória - memory_delete
    const deleteName = text.match(/esque[cç]a\s+meu\s+nome/i);
    if (deleteName) {
      return { tool: "memory_delete", input: { query: "user.name" }, explanation: "Apagando seu nome da memória…" };
    }
    
    // Outros casos explícitos de save
    const saveProjectMatch = text.match(/meu\s+projeto\s+([^\s]+)\s+fica\s+em\s+([^,.]+)/i);
    if (saveProjectMatch) {
      return { tool: "memory_save", input: { key: `project.${saveProjectMatch[1].toLowerCase()}.path`, value: saveProjectMatch[2].trim(), category: "project" }, explanation: `Salvando caminho do projeto ${saveProjectMatch[1]}…` };
    }

    return null; // Deixa para o Ollama
  }
}
