import type { ConnectionCapability } from "@nexo/shared";
import type { ConnectionService } from "../../connections/service.js";
import type { ToolRegistry } from "../../tools/registry.js";

const connectionCapabilities = new Set<ConnectionCapability>([
  "email.read", "email.send", "email.modify", "calendar.read", "calendar.write"
]);

export type AgentToolDescriptor = {
  name: string;
  description: string;
  domain: string;
  operation: string;
  risk: string;
  mutatesState: boolean;
  requiresConfirmation: boolean;
  permissions: string[];
  parameters?: unknown;
};

export class CapabilityAwareToolCatalog {
  constructor(private readonly registry: ToolRegistry, private readonly connections?: ConnectionService) {}

  list(): AgentToolDescriptor[] {
    return this.registry.definitions().filter(tool => {
      for (const permission of tool.permissions) {
        if (!connectionCapabilities.has(permission as ConnectionCapability)) continue;
        if (this.connections?.resolveForCapability(permission as ConnectionCapability).status !== "ready") return false;
      }
      return true;
    }).map(tool => ({
      name: tool.name,
      description: tool.description,
      domain: tool.domain ?? domainFromName(tool.name),
      operation: tool.operation ?? operationFromName(tool.name),
      risk: tool.risk,
      mutatesState: tool.mutatesState ?? tool.risk !== "READ",
      requiresConfirmation: tool.mutatesState ?? tool.risk !== "READ",
      permissions: [...tool.permissions],
      parameters: this.registry.agentSchema(tool.name)
    }));
  }
}

export function describeDomainTools(domain: string, tools: AgentToolDescriptor[]) {
  const relevant = tools.filter(tool => tool.domain === domain);
  if (!relevant.length) return `Não há ferramentas de ${domain} disponíveis com as conexões e permissões atuais.`;
  const reads = relevant.filter(tool => !tool.mutatesState);
  const writes = relevant.filter(tool => tool.mutatesState);
  const label = domain === "email" ? "Gmail/e-mail" : domain === "calendar" ? "agenda" : domain;
  const lines = [`Com as permissões atuais, posso usar ${label}:`];
  if (reads.length) {
    lines.push("", "Leitura e consulta:");
    for (const tool of reads) lines.push(`• ${tool.description}.`);
  }
  if (writes.length) {
    lines.push("", "Alterações — sempre pedem sua confirmação antes de executar:");
    for (const tool of writes) lines.push(`• ${tool.description}.`);
  }
  return lines.join("\n");
}

function domainFromName(name: string) {
  if (name.startsWith("email_")) return "email";
  if (name.startsWith("calendar_")) return "calendar";
  if (name.startsWith("browser_")) return "browser";
  if (name.startsWith("memory_")) return "memory";
  if (/file|folder|filesystem/.test(name)) return "filesystem";
  if (/system|memory_usage|disk_usage|process/.test(name)) return "system";
  return "general";
}
function operationFromName(name: string) { return name.replace(/^[^_]+_/, ""); }
