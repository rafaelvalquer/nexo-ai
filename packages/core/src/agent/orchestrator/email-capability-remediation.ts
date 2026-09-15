import type { ConnectionCapability, ConnectionResolution } from "@nexo/shared";

type CapabilityConnectionService = {
  resolveForCapability(capability: ConnectionCapability): ConnectionResolution;
  test(id: string): Promise<unknown>;
};

export function isEmailSendRequest(userRequest: string) {
  const normalized = userRequest.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const mentionsEmail = /\b(e-?mail|emails)\b/.test(normalized) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(normalized);
  const asksToSend = /\b(envie|enviar|envia|mande|mandar|send|enviar-me|encaminhe|encaminhar|responda|responder)\b/.test(normalized);
  return mentionsEmail && asksToSend;
}

/**
 * Revalidates a Google connection once when email.send was explicitly requested
 * but is missing from the operational capability list. This heals connections
 * created by older builds that lost send capability when Google omitted `scope`
 * from a token response.
 */
export async function resolveEmailSendCapability(service: CapabilityConnectionService): Promise<ConnectionResolution> {
  let resolution = service.resolveForCapability("email.send");
  if (resolution.status !== "missing_capability") return resolution;

  const account = resolution.account;
  const requested = account.requestedCapabilities ?? account.capabilities;
  if (account.provider !== "google" || !requested.includes("email.send")) return resolution;

  try {
    await service.test(account.id);
  } catch {
    // Keep the original remediation path. test() already records diagnostics and
    // the user should never lose a working read/modify connection because repair failed.
  }

  resolution = service.resolveForCapability("email.send");
  return resolution;
}

export function emailSendCapabilityRemediation(resolution: ConnectionResolution): string | undefined {
  if (resolution.status === "ready") return undefined;
  if (resolution.status === "not_connected") {
    return "Nenhuma conta Google ou Microsoft está conectada para envio. Abra Conexões, conecte uma conta e habilite a permissão ‘Enviar e-mails’.";
  }

  const account = resolution.account;
  const label = account.accountEmail ?? (account.provider === "google" ? "Google" : "Microsoft");
  const path = "Abra Conexões > Gerenciar conexão > Editar permissões, marque ‘Enviar e-mails’ e escolha ‘Salvar e reautorizar’.";

  if (resolution.status === "missing_capability") {
    return `Sua conta ${label} está conectada, mas a permissão para enviar e-mails não está operacional. ${path}`;
  }
  if (resolution.status === "expired") {
    return `A autorização da conta ${label} expirou. ${path}`;
  }
  return `A conta ${label} precisa ser autorizada novamente antes de enviar e-mails. ${account.reauthorizationReason ? `${account.reauthorizationReason} ` : ""}${path}`;
}
