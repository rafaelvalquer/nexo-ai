import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import { MemorySecretStore, type OAuthHost } from "../../packages/core/src/connections/types.js";
import { TokenManager } from "../../packages/core/src/auth/token-manager.js";

let root: string;
let db: NexoDatabase;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-google-secret-test-"));
  db = new NexoDatabase(root);
  await db.ready();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Google OAuth desktop client secret", () => {
  it("sends NEXO_GOOGLE_CLIENT_SECRET when exchanging the authorization code", async () => {
    const oldClientId = process.env.NEXO_GOOGLE_CLIENT_ID;
    const oldClientSecret = process.env.NEXO_GOOGLE_CLIENT_SECRET;
    const oldFetch = globalThis.fetch;
    process.env.NEXO_GOOGLE_CLIENT_ID = "desktop-client";
    process.env.NEXO_GOOGLE_CLIENT_SECRET = "desktop-secret";

    let tokenBody: URLSearchParams | undefined;
    const secrets = new MemorySecretStore();
    const host: OAuthHost = {
      openExternal: async () => undefined,
      waitForLoopbackCallback: async () => new URL("http://127.0.0.1/oauth/callback?code=code&state=state"),
      startLoopbackCallback: async ({ state }) => ({
        redirectUri: "http://127.0.0.1:4567/oauth/callback",
        callback: Promise.resolve(new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`))
      })
    };

    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("oauth2.googleapis.com/token")) {
        tokenBody = new URLSearchParams(String(init?.body ?? ""));
        return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }), { status: 200 });
      }
      if (target.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return new Response(JSON.stringify({ sub: "google-user", email: "person@example.com", name: "Person" }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${target}`);
    }) as typeof fetch;

    try {
      const service = new ConnectionService(db, secrets, host);
      const account = await service.connect("google", ["email.read"]);
      expect(account.status).toBe("connected");
      expect(tokenBody?.get("client_id")).toBe("desktop-client");
      expect(tokenBody?.get("client_secret")).toBe("desktop-secret");
      expect(tokenBody?.get("code_verifier")).toBeTruthy();
    } finally {
      globalThis.fetch = oldFetch;
      if (oldClientId === undefined) delete process.env.NEXO_GOOGLE_CLIENT_ID; else process.env.NEXO_GOOGLE_CLIENT_ID = oldClientId;
      if (oldClientSecret === undefined) delete process.env.NEXO_GOOGLE_CLIENT_SECRET; else process.env.NEXO_GOOGLE_CLIENT_SECRET = oldClientSecret;
    }
  });

  it("sends the same client secret when refreshing a Google access token", async () => {
    const oldClientSecret = process.env.NEXO_GOOGLE_CLIENT_SECRET;
    const oldFetch = globalThis.fetch;
    process.env.NEXO_GOOGLE_CLIENT_SECRET = "desktop-secret";
    const secrets = new MemorySecretStore();
    await secrets.set("connection:test:tokens", JSON.stringify({ access_token: "expired", refresh_token: "refresh", expires_at: "2000-01-01T00:00:00.000Z" }));

    let refreshBody: URLSearchParams | undefined;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      refreshBody = new URLSearchParams(String(init?.body ?? ""));
      return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 });
    }) as typeof fetch;

    try {
      const manager = new TokenManager(secrets, () => ({ googleClientId: "desktop-client", microsoftClientId: "", microsoftTenant: "common" }));
      await expect(manager.accessToken("google", "connection:test:tokens")).resolves.toMatchObject({ accessToken: "fresh", refreshed: true });
      expect(refreshBody?.get("client_secret")).toBe("desktop-secret");
    } finally {
      globalThis.fetch = oldFetch;
      if (oldClientSecret === undefined) delete process.env.NEXO_GOOGLE_CLIENT_SECRET; else process.env.NEXO_GOOGLE_CLIENT_SECRET = oldClientSecret;
    }
  });
});
