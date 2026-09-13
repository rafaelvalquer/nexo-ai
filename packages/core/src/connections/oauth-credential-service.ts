import type { SecretStore } from "./types.js";

const GOOGLE_CLIENT_SECRET_KEY = "oauth:google:client_secret";

export class OAuthCredentialService {
  constructor(private readonly secrets: SecretStore) {}

  async getGoogleClientSecret() {
    const stored = (await this.secrets.get(GOOGLE_CLIENT_SECRET_KEY))?.trim();
    return stored || process.env.NEXO_GOOGLE_CLIENT_SECRET?.trim() || null;
  }

  async hasGoogleClientSecret() {
    return Boolean((await this.getGoogleClientSecret())?.trim());
  }

  async saveGoogleClientSecret(value: string) {
    const secret = value.trim();
    if (secret.length < 8) throw new Error("O Client Secret do Google informado não parece válido.");
    await this.secrets.set(GOOGLE_CLIENT_SECRET_KEY, secret);
  }

  async deleteGoogleClientSecret() {
    await this.secrets.delete(GOOGLE_CLIENT_SECRET_KEY);
  }
}
