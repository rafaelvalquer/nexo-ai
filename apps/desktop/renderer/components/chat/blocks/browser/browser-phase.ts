import type { BrowserRunPhase, BrowserRunStatus } from "@nexo/shared/browser-agent";

export function browserPhaseLabel(phase?: BrowserRunPhase) {
  switch (phase) {
    case "initializing": return "Preparando execução…";
    case "launching_browser": return "Iniciando Chrome…";
    case "browser_ready": return "Navegador iniciado";
    case "checking_model": return "Verificando Ollama…";
    case "loading_agent": return "Carregando Browser Agent…";
    case "waiting_model": return "Aguardando modelo…";
    case "agent_ready": return "Browser Agent pronto";
    case "executing": return "Navegando…";
    case "finishing": return "Preparando resultado…";
    default: return undefined;
  }
}

export function browserStatusFallback(status: BrowserRunStatus, error?: string) {
  if (status === "starting") return "Preparando navegador…";
  if (status === "completed") return "Pesquisa concluída";
  if (status === "failed") return error ?? "Falha na execução";
  if (status === "paused") return "Execução pausada";
  if (status === "waiting_approval") return "Aguardando aprovação";
  if (status === "cancelled") return "Execução cancelada";
  return "Navegando…";
}
