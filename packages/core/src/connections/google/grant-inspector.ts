
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
  // The authorization-code token response is the only reported-scope source.
  // When Google omits `scope`, keep the internal state unknown. Persisted scopes
  // are never evidence for a new token response (including refresh responses).
  const scopes = tokenResponseScopes;
  const scopeSource: GoogleScopeSource = tokenResponseScopes.length
    ? "token-response" : "unknown";

  return {
    clientId: undefined,
    scopes,
    scopeSource,
    clientMatches: undefined
  };
}

export function parseScopes(value?: string): string[] {
  if (!value?.trim()) return [];
  return unique(value.trim().split(/\s+/).filter(Boolean));
}

function unique(values: string[]) { return [...new Set(values)]; }
function firstString(...values: unknown[]) { return values.find(value => typeof value === "string" && value.length > 0) as string | undefined; }
function numberOrUndefined(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
