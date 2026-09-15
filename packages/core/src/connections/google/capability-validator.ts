import { isCapabilityOperational, type CapabilityGrant, type ConnectionCapability } from "@nexo/shared";
import type { GoogleScopeSource } from "./grant-inspector.js";
import { capabilityLabel, expectedGoogleScopes, supportingGoogleScope } from "./scope-policy.js";

const GOOGLE_GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const GOOGLE_CALENDAR_PROBE = "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1";
const GOOGLE_PROBE_TIMEOUT_MS = 30_000;

type ProbeResult = {
  ok: boolean;
  httpStatus?: number;
  reason?: string;
  message?: string;
  category?: "api_disabled" | "insufficient_permission" | "access_denied" | "unauthorized" | "transient" | "provider_error";
};

export type GoogleCapabilityValidation = {
  grants: CapabilityGrant[];
  operationalCapabilities: ConnectionCapability[];
};

export async function validateGoogleCapabilities(options: {
  accessToken: string;
  requestedCapabilities: ConnectionCapability[];
  grantedScopes: string[];
  scopeSource: GoogleScopeSource;
}): Promise<GoogleCapabilityValidation> {
  const now = new Date().toISOString();
  const requested = [...new Set(options.requestedCapabilities)];
  const scopeMap = new Map<ConnectionCapability, string | undefined>();
  for (const capability of requested) scopeMap.set(capability, supportingGoogleScope(options.grantedScopes, capability));

  // Run read/calendar probes even when `scope` was omitted. The API result is
  // the source of truth in that case; requested scopes are never inferred.
  const needsGmailProbe = requested.some(capability => capability === "email.read" || capability === "email.modify");
  const needsCalendarProbe = requested.some(capability => capability.startsWith("calendar."));

  const [gmailProbe, calendarProbe] = await Promise.all([
    needsGmailProbe ? probe(options.accessToken, GOOGLE_GMAIL_PROFILE) : Promise.resolve<ProbeResult | undefined>(undefined),
    needsCalendarProbe ? probe(options.accessToken, GOOGLE_CALENDAR_PROBE) : Promise.resolve<ProbeResult | undefined>(undefined)
  ]);

  const grants = requested.map(capability => {
    const supportingScope = scopeMap.get(capability);
    const expectedScopes = expectedGoogleScopes(capability);
    if (capability === "email.send") {
      if (supportingScope) return {
        capability, requested: true, expectedScopes, granted: true, grantedByScope: supportingScope,
        validated: true, status: "validated", validationSource: scopeValidationSource(options.scopeSource), lastValidatedAt: now
      } satisfies CapabilityGrant;
      return {
        capability, requested: true, expectedScopes, granted: false, validated: false,
        status: options.scopeSource === "unknown" ? "unavailable" : "denied",
        validationSource: options.scopeSource === "unknown" ? undefined : scopeValidationSource(options.scopeSource),
        providerReason: options.scopeSource === "unknown" ? "scope_unknown" : "missing_scope",
        providerMessage: options.scopeSource === "unknown"
          ? `O Google não informou os scopes concedidos para ${capabilityLabel(capability)}.`
          : `O token Google não contém um scope compatível com ${capabilityLabel(capability)}.`, lastValidatedAt: now
      } satisfies CapabilityGrant;
    }
    if (!supportingScope && options.scopeSource !== "unknown") {
      return {
        capability,
        requested: true,
        expectedScopes,
        granted: false,
        validated: false,
        status: "denied",
        validationSource: scopeValidationSource(options.scopeSource),
        providerReason: "missing_scope",
        providerMessage: `O token Google não contém um scope compatível com ${capabilityLabel(capability)}.`,
        lastValidatedAt: now
      } satisfies CapabilityGrant;
    }

    // There is no side-effect-free Gmail endpoint that proves send by itself;
    // the reported `gmail.send`/`gmail.modify` grant is handled above without mutation.

    const serviceProbe = capability.startsWith("email.") ? gmailProbe : calendarProbe;
    if (serviceProbe?.ok) {
      return {
        capability,
        requested: true,
        expectedScopes,
        granted: true,
        grantedByScope: supportingScope,
        validated: true,
        status: "validated",
        validationSource: "api-probe",
        lastValidatedAt: now
      } satisfies CapabilityGrant;
    }

    return {
      capability,
      requested: true,
      expectedScopes,
      granted: true,
      grantedByScope: supportingScope,
      validated: false,
      status: serviceProbe?.category === "unauthorized" ? "reauthorization-required" : "unavailable",
      validationSource: "api-probe",
      providerReason: serviceProbe?.category === "insufficient_permission" ? "scope_present_api_denied" : serviceProbe?.category,
      providerMessage: explainProbeFailure(capability, serviceProbe),
      httpStatus: serviceProbe?.httpStatus,
      lastValidatedAt: now
    } satisfies CapabilityGrant;
  });

  return {
    grants,
    operationalCapabilities: grants.filter(isCapabilityOperational).map(grant => grant.capability)
  };
}

function scopeValidationSource(source: GoogleScopeSource): CapabilityGrant["validationSource"] {
  if (source === "token-response") return "token-response";
  if (source === "tokeninfo") return "tokeninfo";
  return undefined;
}

async function probe(token: string, url: string): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(GOOGLE_PROBE_TIMEOUT_MS)
    });
  } catch (error) {
    return { ok: false, category: "transient", message: error instanceof Error ? error.message : String(error) };
  }
  if (response.ok) return { ok: true, httpStatus: response.status };
  const body = await safeJson(response);
  const details = googleErrorDetails(body);
  const raw = `${details.reason ?? ""} ${details.message ?? ""}`.toLowerCase();
  const category: ProbeResult["category"] = response.status === 401
    ? "unauthorized"
    : response.status === 403 && /(accessnotconfigured|disabled|has not been used|serviceusage)/.test(raw)
      ? "api_disabled"
      : response.status === 403 && /(insufficient|scope|permission)/.test(raw)
        ? "insufficient_permission"
        : response.status === 403
          ? "access_denied"
          : response.status === 429 || response.status >= 500
            ? "transient"
            : "provider_error";
  return { ok: false, httpStatus: response.status, reason: details.reason, message: details.message, category };
}

function explainProbeFailure(capability: ConnectionCapability, probeResult?: ProbeResult) {
  const service = capability.startsWith("email.") ? "Gmail" : "Google Calendar";
  if (!probeResult) return `${service}: não foi possível executar a validação operacional.`;
  if (probeResult.category === "api_disabled") return `${service}: a API está desabilitada ou pertence a um projeto diferente do Client ID OAuth. Habilite-a em Google Cloud → Google Auth Platform → Data Access e confirme o projeto do Client ID.`;
  if (probeResult.category === "insufficient_permission") return `${service}: o scope necessário está presente no token, mas a API recusou a chamada por permissão insuficiente. Verifique Google Cloud → Google Auth Platform → Data Access, habilitação da API e Test users quando o app estiver em Testing.`;
  if (probeResult.category === "unauthorized") return `${service}: o access token foi recusado. A conta precisa ser autorizada novamente.`;
  if (probeResult.category === "access_denied") return `${service}: o Google negou o acesso por política ou configuração da conta/projeto. Verifique Data Access e Test users e revogue o acesso do Nexo antes de reautorizar.`;
  if (probeResult.category === "transient") return `${service}: a validação falhou temporariamente${probeResult.httpStatus ? ` (HTTP ${probeResult.httpStatus})` : ""}. A autorização foi preservada.`;
  return `${service}: o Google recusou a validação${probeResult.httpStatus ? ` (HTTP ${probeResult.httpStatus})` : ""}.`;
}

function googleErrorDetails(body: Record<string, unknown>) {
  const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
  const errors = Array.isArray(error.errors) ? error.errors : [];
  const first = errors.find(item => item && typeof item === "object") as Record<string, unknown> | undefined;
  return { reason: firstString(first?.reason, error.reason, body.reason), message: firstString(error.message, body.message) };
}

function firstString(...values: unknown[]) { return values.find(value => typeof value === "string" && value.length > 0) as string | undefined; }
async function safeJson(response: Response): Promise<Record<string, unknown>> { try { return await response.json() as Record<string, unknown>; } catch { return {}; } }
