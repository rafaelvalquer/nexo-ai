import { shell } from "electron";
import http from "node:http";
import type { OAuthHost } from "@nexo/core";

const LOOPBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/oauth/callback";

function callbackPage(title: string, message: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fb;color:#172033;margin:0;padding:48px}
    main{max-width:640px;margin:10vh auto;background:#fff;border:1px solid #dfe5ef;border-radius:18px;padding:32px;box-shadow:0 12px 34px rgba(17,32,51,.08)}
    h1{font-size:24px;margin:0 0 12px}p{line-height:1.55;margin:0;color:#4c5870}
  </style>
</head>
<body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
}

function callbackUrl(requestUrl: string | undefined) {
  return new URL(requestUrl ?? "/", `http://${LOOPBACK_HOST}`);
}

/** Main-process OAuth helper: opens the system browser and accepts one loopback callback. */
export class DesktopOAuthHost implements OAuthHost {
  async openExternal(url: string) {
    await shell.openExternal(url);
  }

  async waitForLoopbackCallback(options: { state: string; timeoutMs: number }): Promise<URL> {
    const pending = await this.startLoopbackCallback(options);
    return pending.callback;
  }

  async startLoopbackCallback({ state, timeoutMs }: { state: string; timeoutMs: number }) {
    let resolveUrl!: (url: URL) => void;
    let rejectUrl!: (error: Error) => void;
    const callback = new Promise<URL>((resolve, reject) => {
      resolveUrl = resolve;
      rejectUrl = reject;
    });

    let done = false;
    let timer: NodeJS.Timeout | undefined;
    const server = http.createServer((request, response) => {
      const url = callbackUrl(request.url);
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");

      if (url.pathname !== CALLBACK_PATH) {
        response.statusCode = 404;
        response.end(callbackPage("Callback OAuth não encontrado", "Volte ao Nexo e tente conectar a conta novamente."));
        return;
      }

      if (url.searchParams.get("state") !== state) {
        response.statusCode = 400;
        response.end(callbackPage("Autenticação inválida", "A resposta recebida não corresponde à solicitação iniciada pelo Nexo. Você pode fechar esta janela."));
        return;
      }

      const providerError = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (providerError) {
        response.statusCode = 400;
        response.end(callbackPage("Autorização não concluída", "O provedor recusou ou interrompeu a autorização. Volte ao Nexo para ver os detalhes."));
      } else if (!code) {
        response.statusCode = 400;
        response.end(callbackPage("Autorização incompleta", "O provedor não retornou o código necessário para concluir a conexão. Volte ao Nexo e tente novamente."));
      } else {
        response.end(callbackPage("Autorização recebida", "O Nexo recebeu a autorização. Volte ao aplicativo enquanto a conexão é validada e salva."));
      }

      if (!done) {
        done = true;
        if (timer) clearTimeout(timer);
        resolveUrl(url);
        server.close();
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, LOOPBACK_HOST, () => resolve()).once("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Não foi possível abrir callback OAuth local.");
    }

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      rejectUrl(new Error("A autenticação expirou. Tente novamente."));
      server.close();
    }, timeoutMs);

    return {
      redirectUri: `http://${LOOPBACK_HOST}:${address.port}${CALLBACK_PATH}`,
      callback
    };
  }
}
