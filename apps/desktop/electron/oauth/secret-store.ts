import { safeStorage } from "electron";
import type { SecretStore } from "@nexo/core";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/** safeStorage is intentionally main-process only. Credentials never cross IPC. */
export class ElectronSecretStore implements SecretStore {
  private filePath() { return path.join(app.getPath("userData"), "secrets.enc.json"); }
  private load(): Record<string, string> { try { return JSON.parse(fs.readFileSync(this.filePath(), "utf8")); } catch { return {}; } }
  private save(values: Record<string, string>) { const target = this.filePath(); fs.mkdirSync(path.dirname(target), { recursive: true }); const temporary = `${target}.tmp`; fs.writeFileSync(temporary, JSON.stringify(values), { mode: 0o600 }); fs.renameSync(temporary, target); }
  async set(key: string, value: string) { if (!safeStorage.isEncryptionAvailable()) throw new Error("A criptografia segura do Windows não está disponível."); const values = this.load(); values[key] = safeStorage.encryptString(value).toString("base64"); this.save(values); }
  async get(key: string) { const encoded = this.load()[key]; return encoded ? safeStorage.decryptString(Buffer.from(encoded, "base64")) : null; }
  async delete(key: string) { const values = this.load(); delete values[key]; this.save(values); }
}
