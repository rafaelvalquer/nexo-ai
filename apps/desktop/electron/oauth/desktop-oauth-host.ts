import { shell } from "electron";
import http from "node:http";
import type { OAuthHost } from "@nexo/core";

/** Main-process OAuth helper: opens the system browser and accepts one loopback callback. */
export class DesktopOAuthHost implements OAuthHost {
  async openExternal(url: string) { await shell.openExternal(url); }
  waitForLoopbackCallback({ state, timeoutMs }: { state: string; timeoutMs: number }): Promise<URL> {
    return new Promise((resolve, reject) => {
      let done = false; const finish = (error?: Error, value?: URL) => { if (done) return; done = true; clearTimeout(timeout); server.close(); error ? reject(error) : resolve(value!); };
      const server = http.createServer((request, response) => { const url = new URL(request.url ?? "/", "http://localhost"); response.setHeader("Content-Type", "text/html; charset=utf-8"); if (url.pathname !== "/oauth/callback" || url.searchParams.get("state") !== state) { response.statusCode = 400; response.end("<p>Autenticação inválida. Você pode fechar esta janela.</p>"); return; } response.end("<p>Autenticação concluída. Você pode voltar ao Nexo.</p>"); finish(undefined, url); });
      server.listen(0, "localhost", () => undefined); const timeout = setTimeout(() => finish(new Error("A autenticação expirou. Tente novamente.")), timeoutMs);
    });
  }
  async startLoopbackCallback({ state, timeoutMs }: { state: string; timeoutMs: number }) {
    let resolveUrl!: (url: URL) => void; let rejectUrl!: (error: Error) => void;
    const callback = new Promise<URL>((resolve, reject) => { resolveUrl = resolve; rejectUrl = reject; });
    let done = false; let timer: NodeJS.Timeout;
    const server = http.createServer((request, response) => { const url = new URL(request.url ?? "/", "http://localhost"); response.setHeader("Content-Type", "text/html; charset=utf-8"); if (url.pathname !== "/oauth/callback") { response.statusCode = 404; response.end("<p>Callback OAuth não encontrado.</p>"); return; } if (url.searchParams.get("state") !== state) { response.statusCode = 400; response.end("<p>Autenticação inválida. Você pode fechar esta janela.</p>"); return; } response.end("<p>Autenticação concluída. Você pode voltar ao Nexo.</p>"); if (!done) { done = true; clearTimeout(timer); resolveUrl(url); server.close(); } });
    await new Promise<void>((resolve, reject) => server.listen(0, "localhost", () => resolve()).once("error", reject));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Não foi possível abrir callback OAuth local.");
    timer = setTimeout(() => { if (!done) { done = true; rejectUrl(new Error("A autenticação expirou. Tente novamente.")); server.close(); } }, timeoutMs);
    return { redirectUri: `http://localhost:${address.port}/oauth/callback`, callback };
  }
}
