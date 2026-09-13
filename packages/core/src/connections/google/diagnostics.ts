import type { CapabilityGrant, ConnectionCapability, ConnectionStatus } from "@nexo/shared";
import type { GoogleGrantSnapshot } from "./grant-inspector.js";
import { capabilityLabel } from "./scope-policy.js";

export type GoogleConnectionDiagnostic = {
  provider: "google";
  status: ConnectionStatus;
  oauthClientId?: string;
  clientMatches?: boolean;
  tokenPresent: boolean;
  refreshTokenPresent: boolean;
  scopeSource: GoogleGrantSnapshot["scopeSource"];
  grantedScopes: string[];
  requestedCapabilities: ConnectionCapability[];
  capabilities: CapabilityGrant[];
  lastValidatedAt?: string;
  lastRefreshAt?: string;
  lastHealthCheckAt?: string;
  inspectionError?: string;
};

export function connectionStatusFromGrants(requested: ConnectionCapability[], grants: CapabilityGrant[]): ConnectionStatus {
  if (!requested.length) return "error";
  const validated = grants.filter(grant => grant.requested && grant.validated).length;
  if (validated === requested.length) return "connected";
  if (validated > 0) return "degraded";
  return "reauthorization-required";
}

export function summarizeGrantFailures(grants: CapabilityGrant[]): string | undefined {
  const failed = grants.filter(grant => grant.requested && !grant.validated);
  if (!failed.length) return undefined;
  return failed.map(grant => {
    const expected = grant.expectedScopes.join(" ou ");
    if (!grant.granted) return `${capabilityLabel(grant.capability)}: o token não contém ${expected}.`;
    if (grant.providerMessage) return `${capabilityLabel(grant.capability)}: ${grant.providerMessage}`;
    return `${capabilityLabel(grant.capability)}: autorização concedida, mas a capability não está operacional.`;
  }).join("\n");
}

export function safeGrantForLog(grant: CapabilityGrant): CapabilityGrant {
  return {
    ...grant,
    expectedScopes: [...grant.expectedScopes],
    providerReason: grant.providerReason?.slice(0, 200),
    providerMessage: grant.providerMessage?.slice(0, 500)
  };
}
