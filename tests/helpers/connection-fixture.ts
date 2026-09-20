import type { NexoDatabase } from "../../packages/core/src/database/db.js";

type Provider = "google" | "microsoft";
type Capability = "email.read" | "email.send" | "email.modify" | "calendar.read" | "calendar.write";

export function seedConnectedAccount({
  db,
  id,
  provider,
  capabilities,
  requestedCapabilities = capabilities,
  status = "connected"
}: {
  db: NexoDatabase;
  id: string;
  provider: Provider;
  capabilities: Capability[];
  requestedCapabilities?: Capability[];
  status?: string;
}) {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(
      `INSERT INTO connections(
        id,provider,capabilities_json,token_secret_key,status,created_at,updated_at,
        requested_capabilities_json,granted_scopes_json,last_connected_at,last_validated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        provider,
        JSON.stringify(capabilities),
        `fixture:${id}:token`,
        status,
        now,
        now,
        JSON.stringify(requestedCapabilities),
        "[]",
        now,
        now
      ]
    );

    for (const capability of requestedCapabilities) {
      db.run(
        `INSERT INTO connection_capabilities(
          connection_id,capability,requested,expected_scopes_json,granted,validated,status,validation_source,last_validated_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
        [
          id,
          capability,
          1,
          "[]",
          capabilities.includes(capability) ? 1 : 0,
          1,
          capabilities.includes(capability) ? "validated" : "unavailable",
          "fixture",
          now
        ]
      );
    }
  });
}
