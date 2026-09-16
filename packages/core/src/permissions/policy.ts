import type { NexoSettings, RiskLevel } from "@nexo/shared";
import { PathPolicy } from "../security/path-policy.js";

export class PermissionEngine {
  private readonly paths: PathPolicy;
  constructor(private getSettings: () => NexoSettings) { this.paths = new PathPolicy(() => this.getSettings().allowedRoots); }

  isPathAllowed(target: string) {
    return this.paths.isAllowed(target);
  }

  requiresApproval(risk: RiskLevel, mutatesState = false) {
    if (mutatesState) return true;
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
    this.paths.assertAllowed(target);
  }

  assertCapability(permission: string, available: Iterable<string>) {
    if (!new Set(available).has(permission)) throw new Error(`Capacidade não autorizada: ${permission}`);
  }
}
