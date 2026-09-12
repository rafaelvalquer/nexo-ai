import type { ConnectionAccount, ConnectionCapability, ConnectionProvider, ConnectionStatus } from "@nexo/shared";

export type { ConnectionAccount, ConnectionCapability, ConnectionProvider, ConnectionStatus };
export interface SecretStore { set(key: string, value: string): Promise<void>; get(key: string): Promise<string | null>; delete(key: string): Promise<void>; }
export interface OAuthHost { openExternal(url: string): Promise<void>; waitForLoopbackCallback(options: { state: string; timeoutMs: number }): Promise<URL>; startLoopbackCallback?(options: { state: string; timeoutMs: number }): Promise<{ redirectUri: string; callback: Promise<URL> }>; }
export interface ConnectionAdapter { provider: ConnectionProvider; connect(capabilities: ConnectionCapability[]): Promise<ConnectionAccount>; disconnect(accountId: string): Promise<void>; refreshIfNeeded(accountId: string): Promise<void>; getStatus(accountId: string): Promise<ConnectionStatus>; }

export class MemorySecretStore implements SecretStore {
  private values = new Map<string, string>();
  async set(key: string, value: string) { this.values.set(key, value); }
  async get(key: string) { return this.values.get(key) ?? null; }
  async delete(key: string) { this.values.delete(key); }
}
