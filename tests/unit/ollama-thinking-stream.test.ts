import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { OllamaProvider } from "../../packages/core/src/llm/ollama.js";
import { LLM_STREAM_CONTENT_STARTED, LLM_STREAM_THINKING_STARTED } from "../../packages/core/src/llm/stream-events.js";

let server: http.Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});

describe("Ollama thinking stream", () => {
  it("signals thinking activity without leaking reasoning into the final answer", async () => {
    let requestBody: any;
    server = http.createServer((request, response) => {
      if (request.url !== "/api/chat") {
        response.statusCode = 404;
        response.end("{}");
        return;
      }
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "content-type": "application/x-ndjson" });
        response.write(JSON.stringify({ message:{ thinking:"Vou organizar a resposta." }, done:false }) + "\n");
        response.write(JSON.stringify({ message:{ thinking:"Mais um passo interno." }, done:false }) + "\n");
        response.write(JSON.stringify({ message:{ content:"Olá" }, done:false }) + "\n");
        response.end(JSON.stringify({ message:{ content:" Brasil" }, done:true }) + "\n");
      });
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de teste não iniciou.");

    const provider = new OllamaProvider(`http://127.0.0.1:${address.port}`, "qwen3:1.7b");
    const received: string[] = [];
    const result = await provider.stream([{ role:"user", content:"Me fale do Brasil" }], token => received.push(token));

    expect(result).toBe("Olá Brasil");
    expect(received).toEqual([
      LLM_STREAM_THINKING_STARTED,
      LLM_STREAM_CONTENT_STARTED,
      "Olá",
      " Brasil"
    ]);
    expect(received.join("")).not.toContain("Vou organizar a resposta.");
    expect(requestBody).toMatchObject({ model:"qwen3:1.7b", stream:true, keep_alive:"10m" });
  });
});
