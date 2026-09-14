const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_TOKENINFO_TIMEOUT_MS = 15_000;

export type GoogleScopeSource = "token-response" | "token-info" | "persisted" | "unknown";

export type GoogleGrantSnapshot = {
  clientId?: string;
  scopes: string[];
  scopeSource: GoogleScopeSource;
  expiresIn?: number;
  accountEmail?: string;
  clientMatches?: boolean;
  inspectionError?: string;
};

export class GoogleOAuthClientMismatchError extends Error {
  constructor(readonly configuredClientId: string, readonly tokenClientId: string) {
    super(`O token Google foi emitido para um Client ID diferente do configurado no Nexo. Configurado: ${configuredClientId}. Token: ${tokenClientId}.`);
    this.name = "GoogleOAuthClientMismatchError";
  }
}

export async function inspectGoogleGrant(options: {
  accessToken: string;
  tokenScope?: string;
  configuredClientId: string;
  persistedScopes?: string[];
}): Promise<GoogleGrantSnapshot> {
  const tokenResponseScopes = parseScopes(options.tokenScope);
  const persistedScopes = unique(options.persistedScopes ?? []);
  let tokenInfo: Record<string, unknown> | undefined;
  let inspectionError: string | undefined;

  // The authorization-code token response is authoritative when it reports scopes.
  // tokeninfo is a fallback for providers/flows that omit scope, not a second mandatory network dependency.
  if (!tokenResponseScopes.length) {
    try {
      const query = new URLSearchParams({ access_token: options.accessToken });
      const response = await fetch(`${GOOGLE_TOKENINFO_URL}?${query}`, { signal: AbortSignal.timeout(GOOGLE_TOKENINFO_TIMEOUT_MS) });
      const body = await safeJson(response);
      if (response.ok) tokenInfo = body;
      else inspectionError = tokenInfoError(body, response.status);
    } catch (error) {
      inspectionError = error instanceof Error ? error.message : String(error);
    }
  }

  const tokenInfoScopes = parseScopes(firstString(tokenInfo?.scope));
  const scopes = tokenResponseScopes.length
    ? tokenResponseScopes
    : tokenInfoScopes.length
      ? tokenInfoScopes
      : persistedScopes;
  const scopeSource: GoogleScopeSource = tokenResponseScopes.length
    ? "token-response"
    : tokenInfoScopes.length
      ? "token-info"
      : persistedScopes.length
        ? "persisted"
        : "unknown";

  const tokenClientId = firstString(tokenInfo?.issued_to, tokenInfo?.audience, tokenInfo?.aud);
  if (tokenClientId && options.configuredClientId && tokenClientId !== options.configuredClientId) {
    throw new GoogleOAuthClientMismatchError(options.configuredClientId, tokenClientId);
  }

  return {
    clientId: tokenClientId,
    scopes,
    scopeSource,
    expiresIn: numberOrUndefined(tokenInfo?.expires_in),
    accountEmail: firstString(tokenInfo?.email),
    clientMatches: tokenClientId ? tokenClientId === options.configuredClientId : undefined,
    inspectionError
  };
}

export function parseScopes(value?: string): string[] {
  if (!value?.trim()) return [];
  return unique(value.trim().split(/\s+/).filter(Boolean));
}

function unique(values: string[]) { return [...new Set(values)]; }
function firstString(...values: unknown[]) { return values.find(value => typeof value === "string" && value.length > 0) as string | undefined; }
function numberOrUndefined(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
async function safeJson(response: Response): Promise<Record<string, unknown>> { try { return await response.json() as Record<string, unknown>; } catch { return {}; } }
function tokenInfoError(body: Record<string, unknown>, status: number) {
  const description = firstString(body.error_description, body.error);
  return description ? `tokeninfo HTTP ${status}: ${description}` : `tokeninfo HTTP ${status}`;
}
