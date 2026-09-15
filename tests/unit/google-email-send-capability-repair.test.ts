import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { ConnectionService } from "../../packages/core/src/connections/service.js";
import { MemorySecretStore, type OAuthHost } from "../../packages/core/src/connections/types.js";
import { resolveEmailSendCapability } from "../../packages/core/src/agent/orchestrator/email-capability-remediation.js";

const CLIENT_ID = "desktop-client.apps.googleusercontent.com";
const GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";

let root: string;
let db: NexoDatabase;
let secrets: MemorySecretStore;
let originalFetch: typeof fetch;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-email-send-repair-"));
  db = new NexoDatabase(root);
  await db.ready();
  secrets = new MemorySecretStore();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function host(): OAuthHost {
  return {
    openExternal: async () => undefined,
    waitForLoopbackCallback: async ({ state }) => new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`),
    startLoopbackCallback: async ({ state }) => ({
      redirectUri: "http://127.0.0.1:4567/oauth/callback",
      callback: Promise.resolve(new URL(`http://127.0.0.1:4567/oauth/callback?code=code&state=${state}`))
    })
  };
}

function installGoogleMock() {
  globalThis.fetch = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token") && !url.includes("tokeninfo")) {
      // Reproduces the real failure mode: Google omits `scope` from the token response.
      return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("oauth2.googleapis.com/tokeninfo")) {
      return new Response(JSON.stringify({
        issued_to: CLIENT_ID,
        scope: `openid email profile ${GMAIL_MODIFY}`,
        email: "person@example.com",
        expires_in: 3600
      }), { status: 200 });
    }
    if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
      return new Response(JSON.stringify({ sub: "google-user", email: "person@example.com", name: "Person" }), { status: 200 });
    }
    if (url.includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
      return new Response(JSON.stringify({ emailAddress: "person@example.com" }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
}

describe("Google email.send capability repair", () => {
  it("repairs an older persisted connection when the active token already has gmail.modify", async () => {
    installGoogleMock();
    const service = new ConnectionService(
      db,
      secrets,
      host(),
      () => ({ googleClientId: CLIENT_ID, microsoftClientId: "", microsoftTenant: "common" }),
      () => true
    );
    await service.saveGoogleClientSecret("GOCSPX-test-secret");

    const account = await service.connect("google", ["email.read", "email.send", "email.modify"]);
    expect(account.capabilities).toEqual(expect.arrayContaining(["email.read", "email.send", "email.modify"]));

    // Simulate state persisted by the buggy build: send was requested, the
    // access token is valid, but email.send was dropped from operational state.
    db.run("UPDATE connections SET capabilities_json=?, status='degraded' WHERE id=?", [JSON.stringify(["email.read", "email.modify"]), account.id]);
    db.run("DELETE FROM connection_capabilities WHERE connection_id=? AND capability='email.send'", [account.id]);

    expect(service.resolveForCapability("email.send").status).toBe("missing_capability");

    const repaired = await resolveEmailSendCapability(service);
    expect(repaired.status).toBe("ready");
    expect(service.get(account.id)?.capabilities).toEqual(expect.arrayContaining(["email.read", "email.send", "email.modify"]));
    expect(service.get(account.id)?.capabilityGrants?.find(grant => grant.capability === "email.send")).toMatchObject({
      requested: true,
      granted: true,
      validated: true,
      status: "validated"
    });
  });
});
