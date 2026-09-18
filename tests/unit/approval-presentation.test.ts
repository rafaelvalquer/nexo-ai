import { describe, expect, it } from "vitest";
import { defaultApprovalPresentation, isGenericApprovalReason } from "../../packages/core/src/permissions/approval-presentation.js";

describe("approval presentation", () => {
  it("builds a detailed email send preview", () => {
    const value = defaultApprovalPresentation("email_send_composed", {
      to: [{ email: "rafael@example.com" }],
      subject: "Oi",
      bodyText: "Oi"
    }, "WRITE");

    expect(value.title).toContain("rafael@example.com");
    expect(value.metadata.preview).toContain("Para: rafael@example.com");
    expect(value.metadata.preview).toContain("Assunto: Oi");
    expect(value.metadata.preview).toContain("Mensagem:\nOi");
    expect(value.metadata.consequence).toContain("enviado em seu nome");
  });

  it("describes email mutations with count and exact ids", () => {
    const value = defaultApprovalPresentation("email_bulk_trash", { messageIds: ["m1", "m2"] }, "WRITE");
    expect(value.title).toBe("Mover para a lixeira 2 e-mails");
    expect(value.metadata.affectedCount).toBe(2);
    expect(value.metadata.preview).toContain("m1");
    expect(value.metadata.preview).toContain("m2");
  });

  it("shows the exact filesystem target before creating files and folders", () => {
    const file = defaultApprovalPresentation("create_text_file", {
      path: "C:\\Users\\Rafael\\Downloads\\teste12.txt"
    }, "WRITE");
    expect(file.title).toBe("Criar arquivo teste12.txt");
    expect(file.metadata.preview).toContain("Nome: teste12.txt");
    expect(file.metadata.preview).toContain("Local: C:\\Users\\Rafael\\Downloads");
    expect(file.metadata.preview).toContain("Caminho: C:\\Users\\Rafael\\Downloads\\teste12.txt");
    expect(file.metadata.consequence).toContain("não serão sobrescritos");

    const folder = defaultApprovalPresentation("create_folder", {
      path: "C:\\Users\\Rafael\\Downloads\\NexoTeste"
    }, "WRITE");
    expect(folder.title).toBe("Criar pasta NexoTeste");
    expect(folder.metadata.preview).toContain("Nome: NexoTeste");
    expect(folder.metadata.preview).toContain("Caminho: C:\\Users\\Rafael\\Downloads\\NexoTeste");
  });

  it("recognizes the old generic V2 reason", () => {
    expect(isGenericApprovalReason("A ação proposta pelo agente altera estado e requer sua confirmação.")).toBe(true);
  });
});
