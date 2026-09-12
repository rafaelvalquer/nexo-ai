import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NexoDatabase } from "../database/db.js";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider, ConnectionStatus, OAuthHost, SecretStore } from "./types.js";

type ConnectionRow = { id: string; provider: ConnectionProvider; account_email?: string; display_name?: string; capabilities_json: string; status: ConnectionStatus; last_error?: string; updated_at: string };
export class ConnectionService {
  constructor(private db: NexoDatabase, private secrets: SecretStore, private oauthHost?: OAuthHost) {}
  list(): ConnectionAccount[] { return this.db.all<ConnectionRow>("SELECT * FROM connections ORDER BY updated_at DESC").map(row => this.toAccount(row)); }
  get(id: string) { const row = this.db.get<ConnectionRow>("SELECT * FROM connections WHERE id=?", [id]); return row ? this.toAccount(row) : undefined; }
  defaultFor(capability: ConnectionCapability) { return this.list().find(account => account.status === "connected" && account.capabilities.includes(capability)); }
  async connect(provider: ConnectionProvider, capabilities: ConnectionCapability[]) {
    if (!capabilities.length) throw new Error("Selecione ao menos uma capacidade.");
    const clientId = provider === "google" ? process.env.NEXO_GOOGLE_CLIENT_ID : process.env.NEXO_MICROSOFT_CLIENT_ID;
    if (!clientId) throw new Error(`Configure NEXO_${provider === "google" ? "GOOGLE" : "MICROSOFT"}_CLIENT_ID antes de conectar.`);
    if (!this.oauthHost?.startLoopbackCallback) throw new Error("O host OAuth desta instalação não suporta callback local.");
    const id = randomUUID(), now = new Date().toISOString(), secretKey = `connection:${id}:tokens`, state = randomBytes(24).toString("base64url"), verifier = randomBytes(48).toString("base64url"), challenge = createHash("sha256").update(verifier).digest("base64url");
    const callback = await this.oauthHost.startLoopbackCallback({ state, timeoutMs: Number(process.env.NEXO_OAUTH_CALLBACK_TIMEOUT_MS ?? 180000) });
    const scopes = provider === "google" ? googleScopes(capabilities) : microsoftScopes(capabilities);
    const authorization = provider === "google"
      ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id:clientId, redirect_uri:callback.redirectUri, response_type:"code", access_type:"offline", prompt:"consent", scope:scopes.join(" "), state, code_challenge:challenge, code_challenge_method:"S256" })}`
      : `https://login.microsoftonline.com/${process.env.NEXO_MICROSOFT_TENANT ?? "common"}/oauth2/v2.0/authorize?${new URLSearchParams({ client_id:clientId, redirect_uri:callback.redirectUri, response_type:"code", response_mode:"query", scope:scopes.join(" "), state, code_challenge:challenge, code_challenge_method:"S256" })}`;
    await this.oauthHost.openExternal(authorization); const response = await callback.callback; const code = response.searchParams.get("code"); const denied = response.searchParams.get("error"); if (!code) throw new Error(denied === "admin_consent_required" ? "Sua organização exige aprovação do administrador." : "A autorização foi recusada ou não retornou um código.");
    const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${process.env.NEXO_MICROSOFT_TENANT ?? "common"}/oauth2/v2.0/token`;
    const tokenResponse = await fetch(tokenUrl, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({ client_id:clientId, code, redirect_uri:callback.redirectUri, grant_type:"authorization_code", code_verifier:verifier }) }); const tokens = await tokenResponse.json() as Record<string, unknown>; if (!tokenResponse.ok || typeof tokens.access_token !== "string") throw new Error("Não foi possível concluir a troca segura de credenciais.");
    await this.secrets.set(secretKey, JSON.stringify(tokens)); const profile = await getProfile(provider, String(tokens.access_token));
    this.db.run("INSERT INTO connections(id,provider,account_email,display_name,capabilities_json,token_secret_key,status,created_at,updated_at,last_error) VALUES(?,?,?,?,?,?,?,?,?,?)", [id, provider, profile.email, profile.name, JSON.stringify(capabilities), secretKey, "connected", now, now, null]); return this.get(id)!;
  }
  async disconnect(id: string) { const row = this.db.get<{ token_secret_key: string }>("SELECT token_secret_key FROM connections WHERE id=?", [id]); if (!row) return; await this.secrets.delete(row.token_secret_key); this.db.run("DELETE FROM connections WHERE id=?", [id]); }
  addCapabilities(id: string, capabilities: ConnectionCapability[]) { const existing = this.get(id); if (!existing) throw new Error("Conexão não encontrada."); const all = [...new Set([...existing.capabilities, ...capabilities])]; this.db.run("UPDATE connections SET capabilities_json=?,updated_at=? WHERE id=?", [JSON.stringify(all), new Date().toISOString(), id]); return this.get(id)!; }
  test(id: string) { const account = this.get(id); if (!account) throw new Error("Conexão não encontrada."); return account; }
  async accessToken(id: string, capability: ConnectionCapability) {
    const row = this.db.get<{ token_secret_key:string; capabilities_json:string; status:ConnectionStatus }>("SELECT token_secret_key,capabilities_json,status FROM connections WHERE id=?", [id]);
    if (!row || row.status !== "connected") throw new Error("A conexão não está ativa. Reconecte a conta.");
    if (!JSON.parse(row.capabilities_json).includes(capability)) throw new Error(`A conta conectada não possui a capacidade ${capability}.`);
    const raw = await this.secrets.get(row.token_secret_key); if (!raw) throw new Error("A credencial segura não está disponível. Reconecte a conta."); const tokens = JSON.parse(raw) as { access_token?:string }; if (!tokens.access_token) throw new Error("A credencial não possui token de acesso."); return tokens.access_token;
  }
  private toAccount(row: ConnectionRow): ConnectionAccount { return { id: row.id, provider: row.provider, accountEmail: row.account_email, displayName: row.display_name, capabilities: JSON.parse(row.capabilities_json), status: row.status, lastError: row.last_error, updatedAt: row.updated_at }; }
}

const googleScopes = (items: ConnectionCapability[]) => [...new Set(["openid", "email", "profile", ...items.flatMap(item => ({ "email.read":"https://www.googleapis.com/auth/gmail.readonly", "email.send":"https://www.googleapis.com/auth/gmail.send", "email.modify":"https://www.googleapis.com/auth/gmail.modify", "calendar.read":"https://www.googleapis.com/auth/calendar.readonly", "calendar.write":"https://www.googleapis.com/auth/calendar" } as Record<ConnectionCapability,string>)[item])])];
const microsoftScopes = (items: ConnectionCapability[]) => [...new Set(["openid", "profile", "offline_access", "User.Read", ...items.flatMap(item => ({ "email.read":"Mail.Read", "email.send":"Mail.Send", "email.modify":"Mail.ReadWrite", "calendar.read":"Calendars.Read", "calendar.write":"Calendars.ReadWrite" } as Record<ConnectionCapability,string>)[item])])];
async function getProfile(provider: ConnectionProvider, token: string) { const response = await fetch(provider === "google" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${token}` } }); const value = await response.json() as any; return { email: value.email ?? value.mail ?? value.userPrincipalName ?? undefined, name: value.name ?? undefined }; }
