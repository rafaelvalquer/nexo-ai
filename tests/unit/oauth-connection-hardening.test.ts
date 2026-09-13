import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import type { OAuthHost, SecretStore } from "../../packages/core/src/connections/types.js";

class RecordingSecretStore implements SecretStore {
  values = new Map<string, string>();
  async set(key: string, value: string) { this.values.set(key, value); }
  async get(key: string) { return this.values.get(key) ?? null; }
  async delete(key: string) { this.values.delete(key); }
}

let root: string;
let db: NexoDatabase;
let originalFetch: typeof fetch;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-oauth-hardening-"));
  db = new NexoDatabase(root);
  await db.ready();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function googleHost(onOpen: (url: string) => void = () => undefined): OAuthHost {
  return {
    openExternal: async url => onOpen(url),
    waitForLoopbackCallback: async ({ state }) => new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`),
    startLoopbackCallback: async ({ state }) => ({
      redirectUri: "http://127.0.0.1:4567/oauth/callback",
      callback: Promise.resolve(new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`))
    })
  };
}

async function googleService(secrets: SecretStore, host: OAuthHost = googleHost()) {
  const service = new ConnectionService(
    db,
    secrets,
    host,
    () => ({ googleClientId: "desktop-client.apps.googleusercontent.com", microsoftClientId: "", microsoftTenant: "common" }),
    () => true
  );
  await service.saveGoogleClientSecret("GOCSPX-test-secret");
  return service;
}

describe("Google OAuth persistence hardening", () => {
  it("validates the Google profile and Gmail API before persisting a connected account", async () => {
    const secrets = new RecordingSecretStore();
    let opened = "";
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly" }), { status: 200 });
      }
      if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return new Response(JSON.stringify({ sub: "google-user", email: "person@example.com", name: "Person" }), { status: 200 });
      }
      if (url.includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
        return new Response(JSON.stringify({ emailAddress: "person@example.com", messagesTotal: 10, threadsTotal: 8 }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const service = await googleService(secrets, googleHost(url => { opened = url; }));
    const account = await service.connect("google", ["email.read"]);

    expect(opened).toContain("code_challenge_method=S256");
    expect(opened).toContain(encodeURIComponent("http://127.0.0.1:4567/oauth/callback"));
    expect(opened).toContain(encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly"));
    expect(account).toMatchObject({ provider: "google", accountEmail: "person@example.com", status: "connected", capabilities: ["email.read"] });
    expect(account.grantedScopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(db.all("SELECT * FROM connections")).toHaveLength(1);
    expect(secrets.values.has("oauth:google:client_secret")).toBe(true);
    const tokenEntries = [...secrets.values.entries()].filter(([key]) => key.startsWith("connection:"));
    expect(tokenEntries).toHaveLength(1);
    expect(tokenEntries[0][1]).toContain("refresh");
  });

  it("does not leave an orphaned connection token when Google profile validation fails", async () => {
    const secrets = new RecordingSecretStore();
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "profile unavailable" }), { status: 503 });
    }) as typeof fetch;

    const service = await googleService(secrets);
    await expect(service.connect("google", ["email.read"]))
      .rejects.toThrow(/validando a conta autorizada/i);

    expect(secrets.values.has("oauth:google:client_secret")).toBe(true);
    expect([...secrets.values.keys()].filter(key => key.startsWith("connection:"))).toEqual([]);
    expect(db.all("SELECT * FROM connections")).toEqual([]);
  });

  it("removes the encrypted connection token if database persistence fails", async () => {
    const secrets = new RecordingSecretStore();
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly" }), { status: 200 });
      }
      if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return new Response(JSON.stringify({ sub: "google-user", email: "person@example.com", name: "Person" }), { status: 200 });
      }
      return new Response(JSON.stringify({ emailAddress: "person@example.com" }), { status: 200 });
    }) as typeof fetch;

    const originalRun = db.run.bind(db);
    vi.spyOn(db, "run").mockImplementation((sql: string, params: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO connections")) throw new Error("simulated disk failure");
      return originalRun(sql, params);
    });

    const service = await googleService(secrets);
    await expect(service.connect("google", ["email.read"]))
      .rejects.toThrow(/registrando a conexão no Nexo/i);

    expect(secrets.values.has("oauth:google:client_secret")).toBe(true);
    expect([...secrets.values.keys()].filter(key => key.startsWith("connection:"))).toEqual([]);
    expect(db.all("SELECT * FROM connections")).toEqual([]);
  });

  it("surfaces token exchange errors with the failing OAuth stage", async () => {
    const secrets = new RecordingSecretStore();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: "Bad Request"
    }), { status: 400 })) as typeof fetch;

    const service = await googleService(secrets);
    await expect(service.connect("google", ["email.read"]))
      .rejects.toThrow(/trocando a autorização por tokens.*código de autorização/i);

    expect(secrets.values.has("oauth:google:client_secret")).toBe(true);
    expect([...secrets.values.keys()].filter(key => key.startsWith("connection:"))).toEqual([]);
    expect(db.all("SELECT * FROM connections")).toEqual([]);
  });
});
