import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { FastIntentRouter } from "../../packages/core/src/agent/intent-router.js";

const router = new FastIntentRouter();

describe("FastIntentRouter", () => {
  it("detecta salvar nome", () => {
    const result = router.route("Meu nome é Rafael, pode salvar isso?");
    expect(result).not.toBeNull();
    expect(result?.tool).toBe("memory_save");
    expect(result?.input).toEqual({ key: "user.name", value: "Rafael", category: "profile" });
  });

  it.each([
    "Qual é meu nome?",
    "Sabe o meu nome?",
    "Você lembra do meu nome?",
    "Como eu me chamo?"
  ])("detecta busca por nome: %s", text => {
    const result = router.route(text);
    expect(result?.tool).toBe("memory_search");
    expect(result?.input).toEqual({ query: "user.name" });
  });

  it("detecta esquecimento de nome com a chave esperada", () => {
    const result = router.route("Esqueça meu nome.");
    expect(result?.tool).toBe("memory_delete");
    expect(result?.input).toEqual({ key: "user.name" });
  });

  it("só salva projeto quando há pedido explícito", () => {
    const result = router.route("Lembre que meu projeto TavernQuest fica em C:\\Projetos\\TavernQuest");
    expect(result?.tool).toBe("memory_save");
    expect((result?.input as any)?.key).toBe("project.tavernquest.path");
  });

  it("detecta PC lento", () => {
    const result = router.route("Veja por que meu computador está lento");
    expect(result?.steps?.map(step => step.tool)).toEqual(["system_info", "memory_usage", "disk_usage", "process_list"]);
  });

  it.each([
    "abrir navegador",
    "abrir o navegador",
    "abra o browser"
  ])("abre navegador sem planner: %s", text => {
    const result = router.route(text);
    expect(result?.tool).toBe("browser_launch");
  });

  it("abre Google diretamente", () => {
    const result = router.route("Abrir navegador e entrar no site google.com");
    expect(result?.tool).toBe("browser_open");
    expect(result?.input).toEqual({ url: "https://google.com" });
  });

  it("resolve Instagram por alias", () => {
    const result = router.route("abrir o navegador e entrar no instagram");
    expect(result?.tool).toBe("browser_open");
    expect(result?.input).toEqual({ url: "https://www.instagram.com" });
  });

  it("lista Downloads", () => {
    const result = router.route("listar arquivos da pasta download");
    expect(result?.tool).toBe("list_files");
    expect(result?.input).toEqual({ path: path.join(os.homedir(), "Downloads") });
  });

  it("analisa maiores arquivos de Downloads", () => {
    const result = router.route("analise a pasta download e veja quais são os maiores arquivos");
    expect(result?.tool).toBe("largest_files");
    expect((result?.input as any)?.path).toBe(path.join(os.homedir(), "Downloads"));
  });

  it("encaminha configuração de e-mail para o fluxo com estado de conexão", () => {
    const result = router.route("como configuro o meu e-mail para voce ter acesso?");
    expect(result?.tool).toBe("email_search");
  });

  it("resolve configuração de pastas permitidas localmente", () => {
    const result = router.route("Configurar pastas permitidas");
    expect(result?.direct).toContain("Configurações");
  });

  it("resolve capacidades do Nexo localmente", () => {
    const result = router.route("o que voce consegue fazer?");
    expect(result?.direct).toContain("Atualmente o Nexo pode");
  });

  it("detecta resumo diário", () => {
    const result = router.route("Resumo diário");
    expect(result?.tool).toBe("daily_summary");
  });

  it("retorna null para conversa que deve ir ao chat", () => {
    expect(router.route("me ensine javascript")).toBeNull();
    expect(router.route("Olá")).toBeNull();
  });
});
