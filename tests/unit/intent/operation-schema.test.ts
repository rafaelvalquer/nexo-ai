import { describe, expect, it } from "vitest";
import { parseModelIntent } from "../../../packages/core/src/intent/schema.js";

describe("operation specific schemas", () => {
  it("create_folder rejeita entities não pertencentes à operação (content, source, destination, newName, path)", () => {
    const invalidFields = ["content", "source", "destination", "newName", "path"];

    for (const field of invalidFields) {
      expect(() =>
        parseModelIntent({
          schemaVersion: 1,
          domain: "filesystem",
          intent: "create",
          operation: "create_folder",
          entities: {
            name: "teste",
            folder: "downloads",
            [field]: "valor_invalido"
          },
          referencesPreviousResult: false,
          ambiguities: [],
          missing: [],
          modelConfidence: 0.95
        })
      ).toThrow();
    }
  });

  it("create_text_file aceita name, folder e content", () => {
    const parsed = parseModelIntent({
      schemaVersion: 1,
      domain: "filesystem",
      intent: "create",
      operation: "create_text_file",
      entities: {
        name: "teste.txt",
        folder: "downloads",
        content: "Conteudo do arquivo"
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: [],
      modelConfidence: 0.95
    });

    expect(parsed.operation).toBe("create_text_file");
    expect(parsed.entities.name).toBe("teste.txt");
    expect(parsed.entities.content).toBe("Conteudo do arquivo");
  });

  it("write_text_file aceita file, folder, path e content", () => {
    const parsed = parseModelIntent({
      schemaVersion: 1,
      domain: "filesystem",
      intent: "update",
      operation: "write_text_file",
      entities: {
        file: "notas.txt",
        folder: "documents",
        content: "Novo texto"
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: [],
      modelConfidence: 0.9
    });

    expect(parsed.operation).toBe("write_text_file");
    expect(parsed.entities.file).toBe("notas.txt");
  });

  it("find_file rejeita content", () => {
    expect(() =>
      parseModelIntent({
        schemaVersion: 1,
        domain: "filesystem",
        intent: "find",
        operation: "find_file",
        entities: {
          name: "relatorio.pdf",
          content: "texto de busca"
        },
        referencesPreviousResult: false,
        ambiguities: [],
        missing: [],
        modelConfidence: 0.9
      })
    ).toThrow();
  });

  it("copy_file aceita somente source e destination", () => {
    const valid = parseModelIntent({
      schemaVersion: 1,
      domain: "filesystem",
      intent: "update",
      operation: "copy_file",
      entities: {
        source: "C:\\origem.txt",
        destination: "C:\\destino.txt"
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: [],
      modelConfidence: 0.9
    });
    expect(valid.operation).toBe("copy_file");

    expect(() =>
      parseModelIntent({
        schemaVersion: 1,
        domain: "filesystem",
        intent: "update",
        operation: "copy_file",
        entities: {
          source: "C:\\origem.txt",
          destination: "C:\\destino.txt",
          name: "extra.txt"
        },
        referencesPreviousResult: false,
        ambiguities: [],
        missing: [],
        modelConfidence: 0.9
      })
    ).toThrow();
  });

  it("rename_file aceita somente path e newName", () => {
    const valid = parseModelIntent({
      schemaVersion: 1,
      domain: "filesystem",
      intent: "update",
      operation: "rename_file",
      entities: {
        path: "C:\\antigo.txt",
        newName: "novo.txt"
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: [],
      modelConfidence: 0.9
    });
    expect(valid.operation).toBe("rename_file");

    expect(() =>
      parseModelIntent({
        schemaVersion: 1,
        domain: "filesystem",
        intent: "update",
        operation: "rename_file",
        entities: {
          path: "C:\\antigo.txt",
          newName: "novo.txt",
          content: "invalido"
        },
        referencesPreviousResult: false,
        ambiguities: [],
        missing: [],
        modelConfidence: 0.9
      })
    ).toThrow();
  });

  it("ausência de entity obrigatória continua sendo estruturalmente válida no schema", () => {
    const parsed = parseModelIntent({
      schemaVersion: 1,
      domain: "filesystem",
      intent: "create",
      operation: "create_folder",
      entities: {
        name: "teste"
      },
      referencesPreviousResult: false,
      ambiguities: [],
      missing: [],
      modelConfidence: 0.95
    });

    expect(parsed.operation).toBe("create_folder");
    expect(parsed.entities.name).toBe("teste");
    expect(parsed.entities.folder).toBeUndefined();
  });
});
