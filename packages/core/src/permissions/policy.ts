import path from "node:path";
import type { NexoSettings, RiskLevel } from "@nexo/shared";

const blockedWindowsFragments = ["\\windows", "\\program files", "\\appdata"];

export class PermissionEngine {
  constructor(private getSettings: () => NexoSettings) {}

  isPathAllowed(target: string) {
    const resolved = path.resolve(target).toLowerCase();
    if (process.platform === "win32" && blockedWindowsFragments.some(x => resolved.includes(x))) return false;
    return this.getSettings().allowedRoots.some(root => {
      const allowed = path.resolve(root).toLowerCase();
      return resolved === allowed || resolved.startsWith(allowed + path.sep);
    });
  }

  requiresApproval(risk: RiskLevel) {
    const autonomy = this.getSettings().autonomy;
    if (risk === "CRITICAL" || risk === "SENSITIVE") return true;
    if (risk === "SAFE_WRITE") return autonomy === "cautious";
    return false;
  }

  requiresAutomaticMemoryApproval() {
    const settings = this.getSettings();
    return settings.memoryEnabled && settings.memoryAskBeforeSave;
  }

  isMemoryEnabled() {
    const settings = this.getSettings();
    return settings.memoryEnabled && !settings.privateMode;
  }

  assertPath(target: string) {
    if (!this.isPathAllowed(target)) throw new Error(`Caminho fora do escopo permitido: ${target}`);
  }
}
