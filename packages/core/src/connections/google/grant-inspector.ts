const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_TOKENINFO_TIMEOUT_MS = 15_000;

export type GoogleScopeSource = "token-response" | "unknown";

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
  if (tokenResponseScopes.length) {
    return {
      clientId: undefined,
      scopes: tokenResponseScopes,
      scopeSource: "token-response",
      clientMatches: undefined
    };
  }

  // Google may omit `scope` from token/refresh responses. In that case, inspect
  // the active access token instead of downgrading capabilities to "unknown".
  // Persisted scopes remain diagnostic-only and are never treated as evidence
  // for the current token.
  const inspected = await inspectAccessToken(options.accessToken);
  if (!inspected.ok) {
    return {
      clientId: inspected.clientId,
      scopes: [],
      scopeSource: "unknown",
      expiresIn: inspected.expiresIn,
      accountEmail: inspected.accountEmail,
      clientMatches: inspected.clientId ? inspected.clientId === options.configuredClientId : undefined,
      inspectionError: inspected.error
    };
  }

  if (inspected.clientId && options.configuredClientId && inspected.clientId !== options.configuredClientId) {
    throw new GoogleOAuthClientMismatchError(options.configuredClientId, inspected.clientId);
  }

  return {
    clientId: inspected.clientId,
    scopes: inspected.scopes,
    // Existing persistence contracts use "token-response" for provider-reported
    // scope evidence. tokeninfo is also authoritative provider-reported evidence.
    scopeSource: "token-response",
    expiresIn: inspected.expiresIn,
    accountEmail: inspected.accountEmail,
    clientMatches: inspected.clientId ? inspected.clientId === options.configuredClientId : undefined
  };
}

type TokenInfoInspection = {
  ok: boolean;
  scopes: string[];
  clientId?: string;
  expiresIn?: number;
  accountEmail?: string;
  error?: string;
};

async function inspectAccessToken(accessToken: string): Promise<TokenInfoInspection> {
  let response: Response;
  try {
    const url = `${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`;
    response = await fetch(url, { signal: AbortSignal.timeout(GOOGLE_TOKENINFO_TIMEOUT_MS) });
  } catch (error) {
    return {
      ok: false,
      scopes: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let body: Record<string, unknown> = {};
  try { body = await response.json() as Record<string, unknown>; } catch { /* no-op */ }

  const clientId = firstString(body.aud, body.audience, body.issued_to);
  const scopes = parseScopes(firstString(body.scope));
  const expiresIn = numberOrUndefined(body.expires_in);
  const accountEmail = firstString(body.email);

  if (!response.ok) {
    return {
      ok: false,
      scopes: [],
      clientId,
      expiresIn,
      accountEmail,
      error: firstString(body.error_description, body.error, body.message) ?? `Google tokeninfo retornou HTTP ${response.status}.`
    };
  }

  if (!scopes.length) {
    return {
      ok: false,
      scopes: [],
      clientId,
      expiresIn,
      accountEmail,
      error: "O Google validou o access token, mas não informou os scopes concedidos."
    };
  }

  return { ok: true, scopes, clientId, expiresIn, accountEmail };
}

export function parseScopes(value?: string): string[] {
  if (!value?.trim()) return [];
  return unique(value.trim().split(/\s+/).filter(Boolean));
}

function unique(values: string[]) { return [...new Set(values)]; }
function firstString(...values: unknown[]) { return values.find(value => typeof value === "string" && value.length > 0) as string | undefined; }
function numberOrUndefined(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
