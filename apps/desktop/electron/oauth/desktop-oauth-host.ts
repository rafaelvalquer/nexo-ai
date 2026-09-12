import { shell } from "electron";
import http from "node:http";
import type { OAuthHost } from "@nexo/core";

/** Main-process OAuth helper: opens the system browser and accepts one loopback callback. */
export class DesktopOAuthHost implements OAuthHost {
  async openExternal(url: string) { await shell.openExternal(url); }
  waitForLoopbackCallback({ state, timeoutMs }: { state: string; timeoutMs: number }): Promise<URL> {
    return new Promise((resolve, reject) => {
      let done = false; const finish = (error?: Error, value?: URL) => { if (done) return; done = true; clearTimeout(timeout); server.close(); error ? reject(error) : resolve(value!); };
      const server = http.createServer((request, response) => { const url = new URL(request.url ?? "/", "http://127.0.0.1"); response.setHeader("Content-Type", "text/html; charset=utf-8"); if (url.searchParams.get("state") !== state) { response.statusCode = 400; response.end("<p>Autenticação inválida. Você pode fechar esta janela.</p>"); finish(new Error("State OAuth inválido.")); return; } response.end("<p>Autenticação concluída. Você pode voltar ao Nexo.</p>"); finish(undefined, url); });
      server.listen(0, "127.0.0.1", () => undefined); const timeout = setTimeout(() => finish(new Error("A autenticação expirou. Tente novamente.")), timeoutMs);
    });
  }
  async startLoopbackCallback({ state, timeoutMs }: { state: string; timeoutMs: number }) {
    let resolveUrl!: (url: URL) => void; let rejectUrl!: (error: Error) => void;
    const callback = new Promise<URL>((resolve, reject) => { resolveUrl = resolve; rejectUrl = reject; });
    let done = false; let timer: NodeJS.Timeout;
    const server = http.createServer((request, response) => { const url = new URL(request.url ?? "/", "http://127.0.0.1"); response.setHeader("Content-Type", "text/html; charset=utf-8"); if (url.searchParams.get("state") !== state) { response.statusCode = 400; response.end("<p>Autenticação inválida. Você pode fechar esta janela.</p>"); if (!done) { done = true; rejectUrl(new Error("State OAuth inválido.")); server.close(); } return; } response.end("<p>Autenticação concluída. Você pode voltar ao Nexo.</p>"); if (!done) { done = true; clearTimeout(timer); resolveUrl(url); server.close(); } });
    await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", () => resolve()).once("error", reject));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Não foi possível abrir callback OAuth local.");
    timer = setTimeout(() => { if (!done) { done = true; rejectUrl(new Error("A autenticação expirou. Tente novamente.")); server.close(); } }, timeoutMs);
    return { redirectUri: `http://127.0.0.1:${address.port}`, callback };
  }
}
