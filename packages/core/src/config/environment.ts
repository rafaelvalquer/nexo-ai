/** Centralized runtime configuration. Values are read lazily so Electron can load .env before Core initialization. */
export type NexoEnvironment = {
  model: string;
  ollamaUrl: string;
  googleClientId: string;
  microsoftClientId: string;
  microsoftTenant: string;
  embeddingModel: string;
  oauthCallbackTimeoutMs: number;
  documentMaxSizeMb: number;
};

const text = (key: string, fallback: string) => process.env[key]?.trim() || fallback;
const integer = (key: string, fallback: number) => { const value = Number(process.env[key]); return Number.isInteger(value) && value > 0 ? value : fallback; };
export const environment = (): NexoEnvironment => ({
  model: text("NEXO_MODEL", "qwen3:4b"),
  ollamaUrl: text("NEXO_OLLAMA_URL", "http://127.0.0.1:11434"),
  googleClientId: text("NEXO_GOOGLE_CLIENT_ID", ""),
  microsoftClientId: text("NEXO_MICROSOFT_CLIENT_ID", ""),
  microsoftTenant: text("NEXO_MICROSOFT_TENANT", "common"),
  embeddingModel: text("NEXO_EMBEDDING_MODEL", "nomic-embed-text"),
  oauthCallbackTimeoutMs: integer("NEXO_OAUTH_CALLBACK_TIMEOUT_MS", 180000),
  documentMaxSizeMb: integer("NEXO_DOCUMENT_MAX_SIZE_MB", 50)
});
