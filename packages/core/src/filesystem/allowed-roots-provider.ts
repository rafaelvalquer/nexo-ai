import type { PermissionEngine } from "../permissions/policy.js";

/** Convenience facade; PermissionEngine remains the sole filesystem authority. */
export class AllowedRootsProvider {
  constructor(private readonly permissions: PermissionEngine) {}
  get() { return this.permissions.allowedRoots(); }
  hasRoots() { return this.get().length > 0; }
  assertAuthorized(filePath: string) { this.permissions.assertPath(filePath); }
  isAuthorized(filePath: string) { return this.permissions.isPathAllowed(filePath); }
}
