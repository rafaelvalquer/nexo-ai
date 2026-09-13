import type { ConnectionProvider, OAuthConfiguration } from "@nexo/shared";
import type { SecretStore } from "../connections/types.js";
import type { OAuthCredentialService } from "../connections/oauth-credential-service.js";

const TOKEN_HTTP_TIMEOUT_MS = 30_000;
type StoredTokens = { access_token?: string; refresh_token?: string; expires_at?: string; expires_in?: number; scope?: string; [key: string]: unknown };
export type TokenRefreshResult = { accessToken: string; expiresAt?: string; refreshed: boolean };
export type TokenState = { exists:boolean; hasAccessToken:boolean; hasRefreshToken:boolean; expiresAt?:string; expired:boolean };

export class TokenManager {
  constructor(
    private readonly secrets: SecretStore,
    private readonly configuration: () => OAuthConfiguration,
    private readonly oauthCredentials?: OAuthCredentialService
  ) {}

  async state(secretKey: string): Promise<TokenState> {
    const raw = await this.secrets.get(secretKey);
    if (!raw) return { exists:false,hasAccessToken:false,hasRefreshToken:false,expired:true };
    const tokens = parseStoredTokens(raw);
    const expiry = tokens.expires_at ? Date.parse(tokens.expires_at) : Number.POSITIVE_INFINITY;
    return {
      exists:true,
      hasAccessToken:typeof tokens.access_token === "string",
      hasRefreshToken:typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0,
      expiresAt:tokens.expires_at,
      expired:Number.isFinite(expiry) && expiry <= Date.now()
    };
  }

  async accessToken(provider: ConnectionProvider, secretKey: string): Promise<TokenRefreshResult> {
    const raw = await this.secrets.get(secretKey);
    if (!raw) throw new Error("A credencial segura não está disponível. Reconecte a conta.");
    const tokens = parseStoredTokens(raw);
    if (typeof tokens.access_token !== "string") throw new Error("A credencial não possui token de acesso.");
    if (!this.shouldRefresh(tokens)) return { accessToken: tokens.access_token, expiresAt: tokens.expires_at, refreshed: false };
    return this.forceRefresh(provider, secretKey, tokens);
  }

  async forceRefresh(provider: ConnectionProvider, secretKey: string, current?: StoredTokens): Promise<TokenRefreshResult> {
    const tokens = current ?? parseStoredTokens(await this.requireSecret(secretKey));
    if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token) throw new Error("O token expirou e não pode ser renovado. Reconecte a conta.");
    const refreshed = await this.refresh(provider, tokens.refresh_token);
    const next: StoredTokens = {
      ...tokens,
      ...refreshed,
      refresh_token: typeof refreshed.refresh_token === "string" && refreshed.refresh_token ? refreshed.refresh_token : tokens.refresh_token
    };
    next.expires_at = expiryDate(refreshed.expires_in);
    await this.secrets.set(secretKey, JSON.stringify(next));
    if (typeof next.access_token !== "string") throw new Error("O provedor não retornou um novo token de acesso.");
    return { accessToken: next.access_token, expiresAt: next.expires_at, refreshed: true };
  }

  static withExpiry(tokens: Record<string, unknown>) { return { ...tokens, expires_at: expiryDate(tokens.expires_in) }; }

  private async requireSecret(secretKey:string) {
    const raw=await this.secrets.get(secretKey);
    if(!raw) throw new Error("A credencial segura não está disponível. Reconecte a conta.");
    return raw;
  }

  private shouldRefresh(tokens: StoredTokens) {
    if (!tokens.expires_at) return false;
    const expiry = Date.parse(tokens.expires_at);
    return Number.isFinite(expiry) && expiry <= Date.now() + 60_000;
  }

  private async refresh(provider: ConnectionProvider, refreshToken: string): Promise<StoredTokens> {
    const config = this.configuration();
    const clientId = provider === "google" ? config.googleClientId : config.microsoftClientId;
    if (!clientId) throw new Error("O Client ID OAuth não está configurado. Reconecte a conta.");
    const endpoint = provider === "google" ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${config.microsoftTenant}/oauth2/v2.0/token`;
    const params = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token" });
    if (provider === "google") {
      const clientSecret = await this.oauthCredentials?.getGoogleClientSecret();
      if (clientSecret) params.set("client_secret", clientSecret);
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(TOKEN_HTTP_TIMEOUT_MS)
    });
    const body = await safeJson(response);
    if (!response.ok || typeof body.access_token !== "string") {
      const detail = typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(`Não foi possível renovar o token: ${detail}. Reconecte a conta se o problema persistir.`);
    }
    return body as StoredTokens;
  }
}

function parseStoredTokens(raw:string):StoredTokens {
  try { return JSON.parse(raw) as StoredTokens; }
  catch { throw new Error("A credencial segura está corrompida. Reconecte a conta."); }
}
async function safeJson(response:Response):Promise<Record<string,unknown>> { try{return await response.json() as Record<string,unknown>;}catch{return{};} }
function expiryDate(expiresIn: unknown) { const seconds = Number(expiresIn); return Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : undefined; }
