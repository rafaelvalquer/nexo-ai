import type { ConnectionProvider, OAuthConfiguration } from "@nexo/shared";
import type { SecretStore } from "../connections/types.js";

type StoredTokens = { access_token?: string; refresh_token?: string; expires_at?: string; expires_in?: number; [key: string]: unknown };
export type TokenRefreshResult = { accessToken: string; expiresAt?: string; refreshed: boolean };

export class TokenManager {
  constructor(private readonly secrets: SecretStore, private readonly configuration: () => OAuthConfiguration) {}

  async accessToken(provider: ConnectionProvider, secretKey: string): Promise<TokenRefreshResult> {
    const raw = await this.secrets.get(secretKey); if (!raw) throw new Error("A credencial segura não está disponível. Reconecte a conta.");
    const tokens = JSON.parse(raw) as StoredTokens;
    if (typeof tokens.access_token !== "string") throw new Error("A credencial não possui token de acesso.");
    if (!this.shouldRefresh(tokens)) return { accessToken: tokens.access_token, expiresAt: tokens.expires_at, refreshed: false };
    if (typeof tokens.refresh_token !== "string") throw new Error("O token expirou e não pode ser renovado. Reconecte a conta.");
    const refreshed = await this.refresh(provider, tokens.refresh_token);
    const next: StoredTokens = { ...tokens, ...refreshed, refresh_token: typeof refreshed.refresh_token === "string" ? refreshed.refresh_token : tokens.refresh_token };
    next.expires_at = expiryDate(refreshed.expires_in);
    await this.secrets.set(secretKey, JSON.stringify(next));
    if (typeof next.access_token !== "string") throw new Error("O provedor não retornou um novo token de acesso.");
    return { accessToken: next.access_token, expiresAt: next.expires_at, refreshed: true };
  }

  static withExpiry(tokens: Record<string, unknown>) { return { ...tokens, expires_at: expiryDate(tokens.expires_in) }; }

  private shouldRefresh(tokens: StoredTokens) {
    if (!tokens.expires_at) return false;
    const expiry = Date.parse(tokens.expires_at); return Number.isFinite(expiry) && expiry <= Date.now() + 60_000;
  }
  private async refresh(provider: ConnectionProvider, refreshToken: string): Promise<StoredTokens> {
    const config = this.configuration(); const clientId = provider === "google" ? config.googleClientId : config.microsoftClientId;
    const endpoint = provider === "google" ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${config.microsoftTenant}/oauth2/v2.0/token`;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token" }) });
    const body = await response.json() as StoredTokens;
    if (!response.ok || typeof body.access_token !== "string") throw new Error("Não foi possível renovar o token. Reconecte a conta.");
    return body;
  }
}
function expiryDate(expiresIn: unknown) { const seconds = Number(expiresIn); return Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : undefined; }
