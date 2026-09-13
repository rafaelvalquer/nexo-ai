import type { ConnectionDiagnosticSnapshot } from "@nexo/shared";
import type { ConnectionService } from "./service.js";

export class ConnectionHealthService {
  constructor(private readonly connections: ConnectionService) {}

  async check(connectionId: string): Promise<ConnectionDiagnosticSnapshot> {
    await this.connections.test(connectionId);
    return this.connections.diagnostics(connectionId);
  }

  async snapshot(connectionId: string): Promise<ConnectionDiagnosticSnapshot> {
    return this.connections.diagnostics(connectionId);
  }
}
