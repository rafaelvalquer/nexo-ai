import { describe, it, expect } from "vitest";
import { responsePolicy } from "../../packages/core/src/chat/presentation/response-policy.js";
import { ChatPresentationSession } from "../../packages/core/src/chat/presentation/session.js";

describe("responsePolicy", () => {
  it("retorna mode presentation e appendText false para list_files", () => {
    const policy = responsePolicy(["list_files"]);
    expect(policy.mode).toBe("presentation");
    expect(policy.appendText).toBe(false);
  });

  it("retorna mode presentation e appendText false para search_files", () => {
    const policy = responsePolicy(["search_files"]);
    expect(policy.mode).toBe("presentation");
    expect(policy.appendText).toBe(false);
  });

  it("retorna mode presentation e appendText false para busca de emails e agenda", () => {
    expect(responsePolicy(["email_search"]).mode).toBe("presentation");
    expect(responsePolicy(["calendar_list"]).mode).toBe("presentation");
  });

  it("retorna mode synthesize e appendText true para ferramentas não-apresentação", () => {
    const policy = responsePolicy(["read_file"]);
    expect(policy.mode).toBe("synthesize");
    expect(policy.appendText).toBe(true);
  });
});

describe("ChatPresentationSession com appendText", () => {
  it("não adiciona TextBlock secundário quando appendText é false", () => {
    const session = new ChatPresentationSession();
    session.add("list_files", { path: "C:\\Downloads" }, {
      ok: true,
      summary: "3 itens encontrados em C:\\Downloads",
      data: [{ name: "doc.pdf", type: "file", path: "C:\\Downloads\\doc.pdf" }]
    });

    const finished = session.finish("3 itens encontrados em C:\\Downloads", undefined, { appendText: false });
    expect(finished?.presentation.blocks).toHaveLength(1);
    expect(finished?.presentation.blocks[0].type).toBe("resource_collection");
  });

  it("adiciona TextBlock quando appendText é true e texto não está resumido", () => {
    const session = new ChatPresentationSession();
    session.add("read_file", { path: "C:\\doc.txt" }, {
      ok: true,
      summary: "Conteúdo do arquivo",
      data: "Exemplo de conteúdo"
    });

    const finished = session.finish("Análise detalhada do arquivo pelo LLM", undefined, { appendText: true });
    expect(finished?.presentation.blocks.some(b => b.type === "text")).toBe(true);
  });
});
