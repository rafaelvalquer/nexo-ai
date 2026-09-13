import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { OAuthConfiguration } from "@nexo/shared";
import type { NexoDatabase } from "../database/db.js";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider, ConnectionStatus, OAuthHost, SecretStore } from "./types.js";
import { TokenManager } from "../auth/token-manager.js";
import { environment } from "../config/environment.js";

const OAUTH_HTTP_TIMEOUT_MS = 30_000;

type ConnectionRow = {
  id: string;
  provider: ConnectionProvider;
  account_email?: string;
  display_name?: string;
  capabilities_json: string;
  status: ConnectionStatus;
  last_error?: string;
  updated_at: string;
  last_connected_at?: string;
  last_validated_at?: string;
  last_refresh_at?: string;
  token_expires_at?: string;
  provider_account_id?: string;
};

type OAuthTokens = Record<string, unknown> & { access_token: string; expires_at?: string };
type ProviderProfile = { id?: string; email?: string; name?: string };

export class ConnectionService {
  private tokenManager: TokenManager;

  constructor(
    private db: NexoDatabase,
    private secrets: SecretStore,
    private oauthHost?: OAuthHost,
    private oauthConfiguration?: () => OAuthConfiguration,
    private readonly connectionsEnabled = () => true
  ) {
    this.tokenManager = new TokenManager(secrets, () => this.resolveConfiguration());
  }

  list(): ConnectionAccount[] {
    return this.db.all<ConnectionRow>("SELECT * FROM connections ORDER BY updated_at DESC").map(row => this.toAccount(row));
  }

  get(id: string) {
    const row = this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?", [id]);
    return row ? this.toAccount(row) : undefined;
  }

  defaultFor(capability: ConnectionCapability) {
    return this.list().find(account => account.status === "connected" && account.capabilities.includes(capability));
  }

  async connect(provider: ConnectionProvider, capabilities: ConnectionCapability[]) {
    this.assertEnabled();
    if (!capabilities.length) throw new Error("Selecione ao menos uma capacidade.");

    const configuration = this.resolveConfiguration();
    const clientId = provider === "google" ? configuration.googleClientId : configuration.microsoftClientId;
    const providerName = providerLabel(provider);
    if (!clientId) throw new Error(`Configure o Client ID OAuth de ${providerName} em Conexões antes de conectar.`);
    if (!this.oauthHost?.startLoopbackCallback) throw new Error("O host OAuth desta instalação não suporta callback local.");

    const id = randomUUID();
    const now = new Date().toISOString();
    const secretKey = `connection:${id}:tokens`;
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    let callback: Awaited<ReturnType<NonNullable<OAuthHost["startLoopbackCallback"]>>>;
    try {
      callback = await this.oauthHost.startLoopbackCallback({ state, timeoutMs: environment().oauthCallbackTimeoutMs });
    } catch (error) {
      throw oauthStageError(provider, "preparando o callback local", error);
    }

    const scopes = provider === "google" ? googleScopes(capabilities) : microsoftScopes(capabilities);
    const authorization = provider === "google"
      ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: callback.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: scopes.join(" "), state, code_challenge: challenge, code_challenge_method: "S256" })}`
      : `https://login.microsoftonline.com/${configuration.microsoftTenant}/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: callback.redirectUri, response_type: "code", response_mode: "query", scope: scopes.join(" "), state, code_challenge: challenge, code_challenge_method: "S256" })}`;

    try {
      await this.oauthHost.openExternal(authorization);
    } catch (error) {
      throw oauthStageError(provider, "abrindo o navegador", error);
    }

    let response: URL;
    try {
      response = await callback.callback;
    } catch (error) {
      throw oauthStageError(provider, "aguardando a autorização no navegador", error);
    }

    const code = response.searchParams.get("code");
    const denied = response.searchParams.get("error");
    if (!code) throw new Error(oauthErrorMessage(provider, denied, response.searchParams.get("error_description")));

    let tokens: OAuthTokens;
    try {
      tokens = await exchangeAuthorizationCode({ provider, configuration, clientId, code, verifier, redirectUri: callback.redirectUri });
    } catch (error) {
      throw oauthStageError(provider, "trocando a autorização por tokens", error);
    }

    let profile: ProviderProfile;
    try {
      profile = await getProfile(provider, tokens.access_token);
    } catch (error) {
      throw oauthStageError(provider, "validando a conta autorizada", error);
    }

    const storedTokens = TokenManager.withExpiry(tokens) as OAuthTokens;
    try {
      await this.secrets.set(secretKey, JSON.stringify(storedTokens));
    } catch (error) {
      throw oauthStageError(provider, "salvando a credencial segura no computador", error);
    }

    try {
      this.db.run(
        "INSERT INTO connections(id,provider,account_email,display_name,capabilities_json,token_secret_key,status,created_at,updated_at,last_error,last_connected_at,last_validated_at,token_expires_at,provider_account_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [id, provider, profile.email ?? null, profile.name ?? null, JSON.stringify(capabilities), secretKey, "connected", now, now, null, now, now, storedTokens.expires_at ?? null, profile.id ?? null]
      );
    } catch (error) {
      await this.secrets.delete(secretKey).catch(() => undefined);
      throw oauthStageError(provider, "registrando a conexão no Nexo", error);
    }

    const account = this.get(id);
    if (!account) {
      await this.secrets.delete(secretKey).catch(() => undefined);
      throw oauthStageError(provider, "confirmando a conexão salva", new Error("O registro da conexão não pôde ser lido após o salvamento."));
    }
    return account;
  }

  async disconnect(id: string) {
    const row = this.db.get<{ token_secret_key: string }>("SELECT token_secret_key FROM connections WHERE id=?", [id]);
    if (!row) return;
    await this.secrets.delete(row.token_secret_key);
    this.db.run("DELETE FROM connections WHERE id=?", [id]);
  }

  async addCapabilities(id: string, capabilities: ConnectionCapability[]) {
    const existing = this.get(id);
    if (!existing) throw new Error("Conexão não encontrada.");
    const missing = capabilities.filter(capability => !existing.capabilities.includes(capability));
    if (!missing.length) return existing;

    const expanded = [...new Set([...existing.capabilities, ...missing])];
    const reauthorized = await this.connect(existing.provider, expanded);
    const next = this.db.get<{ token_secret_key: string; account_email?: string; display_name?: string; status: ConnectionStatus; last_connected_at?: string; last_validated_at?: string; token_expires_at?: string; provider_account_id?: string }>(
      "SELECT token_secret_key,account_email,display_name,status,last_connected_at,last_validated_at,token_expires_at,provider_account_id FROM connections WHERE id=?",
      [reauthorized.id]
    )!;
    const previous = this.db.get<{ token_secret_key: string }>("SELECT token_secret_key FROM connections WHERE id=?", [id])!;
    const now = new Date().toISOString();

    this.db.run(
      "UPDATE connections SET account_email=?,display_name=?,capabilities_json=?,token_secret_key=?,status=?,last_error=NULL,last_connected_at=?,last_validated_at=?,token_expires_at=?,provider_account_id=?,updated_at=? WHERE id=?",
      [next.account_email ?? null, next.display_name ?? null, JSON.stringify(expanded), next.token_secret_key, next.status, next.last_connected_at ?? now, next.last_validated_at ?? now, next.token_expires_at ?? null, next.provider_account_id ?? null, now, id]
    );
    this.db.run("DELETE FROM connections WHERE id=?", [reauthorized.id]);
    await this.secrets.delete(previous.token_secret_key);
    return this.get(id)!;
  }

  async test(id: string) {
    const account = this.get(id);
    if (!account) throw new Error("Conexão não encontrada.");
    const token = await this.accessToken(id, account.capabilities[0]!);
    const profile = await getProfile(account.provider, token);
    const now = new Date().toISOString();
    this.db.run(
      "UPDATE connections SET account_email=COALESCE(?,account_email),display_name=COALESCE(?,display_name),provider_account_id=COALESCE(?,provider_account_id),last_validated_at=?,status='connected',last_error=NULL,updated_at=? WHERE id=?",
      [profile.email ?? null, profile.name ?? null, profile.id ?? null, now, now, id]
    );
    return this.get(id)!;
  }

  async accessToken(id: string, capability: ConnectionCapability) {
    this.assertEnabled();
    const row = this.db.get<{ token_secret_key: string; capabilities_json: string; status: ConnectionStatus; provider: ConnectionProvider }>(
      "SELECT token_secret_key,capabilities_json,status,provider FROM connections WHERE id=?",
      [id]
    );
    if (!row || row.status !== "connected") throw new Error("A conexão não está ativa. Reconecte a conta.");
    if (!JSON.parse(row.capabilities_json).includes(capability)) throw new Error(`A conta conectada não possui a capacidade ${capability}.`);

    try {
      const token = await this.tokenManager.accessToken(row.provider, row.token_secret_key);
      if (token.refreshed) {
        const now = new Date().toISOString();
        this.db.run("UPDATE connections SET status='connected',last_refresh_at=?,token_expires_at=?,last_error=NULL,updated_at=? WHERE id=?", [now, token.expiresAt ?? null, now, id]);
      }
      return token.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const expired = /expirou|renovar|reconecte/i.test(message);
      this.db.run("UPDATE connections SET status=?,last_error=?,updated_at=? WHERE id=?", [expired ? "expired" : "error", message, new Date().toISOString(), id]);
      throw error;
    }
  }

  private resolveConfiguration(): OAuthConfiguration {
    const saved = this.oauthConfiguration?.();
    const env = environment();
    return {
      googleClientId: saved?.googleClientId.trim() || env.googleClientId,
      microsoftClientId: saved?.microsoftClientId.trim() || env.microsoftClientId,
      microsoftTenant: saved?.microsoftTenant.trim() || env.microsoftTenant
    };
  }

  private assertEnabled() {
    if (!this.connectionsEnabled()) throw new Error("Conexões externas ficam desativadas no modo privado.");
  }

  private toAccount(row: ConnectionRow): ConnectionAccount {
    return {
      id: row.id,
      provider: row.provider,
      accountEmail: row.account_email,
      displayName: row.display_name,
      capabilities: JSON.parse(row.capabilities_json),
      status: row.status,
      lastError: row.last_error,
      updatedAt: row.updated_at,
      lastConnectedAt: row.last_connected_at,
      lastValidatedAt: row.last_validated_at,
      lastRefreshAt: row.last_refresh_at,
      tokenExpiresAt: row.token_expires_at,
      providerAccountId: row.provider_account_id
    };
  }
}

const googleScopes = (items: ConnectionCapability[]) => [...new Set(["openid", "email", "profile", ...items.flatMap(item => ({ "email.read": "https://www.googleapis.com/auth/gmail.readonly", "email.send": "https://www.googleapis.com/auth/gmail.send", "email.modify": "https://www.googleapis.com/auth/gmail.modify", "calendar.read": "https://www.googleapis.com/auth/calendar.readonly", "calendar.write": "https://www.googleapis.com/auth/calendar" } as Record<ConnectionCapability, string>)[item])])];
const microsoftScopes = (items: ConnectionCapability[]) => [...new Set(["openid", "profile", "offline_access", "User.Read", ...items.flatMap(item => ({ "email.read": "Mail.Read", "email.send": "Mail.Send", "email.modify": "Mail.ReadWrite", "calendar.read": "Calendars.Read", "calendar.write": "Calendars.ReadWrite" } as Record<ConnectionCapability, string>)[item])])];

async function exchangeAuthorizationCode({ provider, configuration, clientId, code, verifier, redirectUri }: { provider: ConnectionProvider; configuration: OAuthConfiguration; clientId: string; code: string; verifier: string; redirectUri: string }): Promise<OAuthTokens> {
  const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${configuration.microsoftTenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({ client_id: clientId, code, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
  if (provider === "google") {
    const clientSecret = environment().googleClientSecret;
    if (clientSecret) body.set("client_secret", clientSecret);
  }
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS)
  });
  const tokens = await safeJson(tokenResponse);
  if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
    throw new Error(oauthErrorMessage(provider, typeof tokens.error === "string" ? tokens.error : String(tokens.error ?? ""), typeof tokens.error_description === "string" ? tokens.error_description : undefined));
  }
  return tokens as OAuthTokens;
}

async function getProfile(provider: ConnectionProvider, token: string): Promise<ProviderProfile> {
  const url = provider === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(OAUTH_HTTP_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`O provedor recusou a validação da conta (HTTP ${response.status}).`);
  const value = await response.json() as Record<string, unknown>;
  const email = firstString(value.email, value.mail, value.userPrincipalName);
  const name = firstString(value.name, value.displayName);
  const id = firstString(value.id, value.sub);
  if (provider === "google" && !email) throw new Error("O Google autorizou o acesso, mas não retornou o e-mail da conta.");
  return { id, email, name };
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}

function firstString(...values: unknown[]) {
  return values.find(value => typeof value === "string" && value.length > 0) as string | undefined;
}

function providerLabel(provider: ConnectionProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

function oauthStageError(provider: ConnectionProvider, stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new Error(`Falha ao conectar ${providerLabel(provider)} durante ${stage}: a operação excedeu o tempo limite.`);
  }
  return new Error(`Falha ao conectar ${providerLabel(provider)} durante ${stage}: ${message}`);
}

function oauthErrorMessage(provider: ConnectionProvider, code?: string | null, description?: string | null) {
  const normalizedCode = (code ?? "").toLowerCase();
  const value = `${code ?? ""} ${description ?? ""}`.toLowerCase();
  const providerName = providerLabel(provider);
  if (normalizedCode === "admin_consent_required" || value.includes("admin consent")) return "Sua organização exige aprovação do administrador para estas permissões.";
  if (value.includes("client_secret is missing") || value.includes("client secret is missing")) return "O Google exige o Client Secret desta credencial de aplicativo para computador. Configure NEXO_GOOGLE_CLIENT_SECRET no arquivo .env local e reinicie o Nexo.";
  if (value.includes("redirect_uri_mismatch") || value.includes("aadsts50011")) return "O callback OAuth não foi aceito. Use uma credencial de aplicativo desktop e permita o redirect de loopback http://127.0.0.1 no provedor.";
  if (normalizedCode === "invalid_client") return `${providerName} recusou as credenciais OAuth. Confirme o Client ID e, para Google, o NEXO_GOOGLE_CLIENT_SECRET da mesma credencial de aplicativo para computador.`;
  if (normalizedCode === "invalid_grant") return `${providerName} recusou o código de autorização. Tente conectar novamente; se persistir, recrie a credencial OAuth de aplicativo para computador.`;
  if (value.includes("invalid_scope") || value.includes("scope")) return "Uma ou mais permissões solicitadas não estão configuradas ou aprovadas no provedor.";
  if (value.includes("access_denied") || value.includes("consent")) return provider === "google" ? "O acesso foi recusado. Verifique a tela de consentimento, os usuários de teste e as permissões Google." : "O acesso foi recusado. Verifique o consentimento e as permissões delegadas no Microsoft Entra.";
  const detail = description?.trim();
  if (detail) return `${providerName} recusou a autorização: ${detail.slice(0, 400)}`;
  return "A autorização foi recusada ou não retornou um código válido.";
}
