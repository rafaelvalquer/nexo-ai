import { describe, it, expect, beforeEach } from "vitest";
import { NexoDatabase } from "../../packages/core/src/database/db.js";
import { MemoryRepository } from "../../packages/core/src/memory/memory.repository.js";
import { MemoryService } from "../../packages/core/src/memory/memory.service.js";
import { SensitiveMemoryDetector } from "../../packages/core/src/memory/memory.normalizer.js";

let db: NexoDatabase;
let repo: MemoryRepository;
let service: MemoryService;

beforeEach(async () => {
  db = new NexoDatabase(":memory:" as any);
  await db.ready();
  repo = new MemoryRepository(db);
  service = new MemoryService(repo);
});

describe("memory_save", () => {
  it("salva e recupera uma memória simples", () => {
    service.save("user.name", "Rafael", "profile");
    const results = service.search("user.name");
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe("Rafael");
  });

  it("atualiza memória existente com a mesma chave", () => {
    service.save("user.name", "Rafael", "profile");
    service.save("user.name", "Rafael Valquer", "profile");
    const results = service.search("user.name");
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe("Rafael Valquer");
  });

  it("normaliza a chave para minúsculas", () => {
    service.save("User.Name", "Rafael", "profile");
    const results = service.search("user.name");
    expect(results).toHaveLength(1);
  });
});

describe("memory_search", () => {
  it("retorna vazio quando não há memórias", () => {
    const results = service.search("nome");
    expect(results).toHaveLength(0);
  });

  it("busca por valor também", () => {
    service.save("user.name", "Rafael", "profile");
    const results = service.search("Rafael");
    expect(results).toHaveLength(1);
  });
});

describe("memory_delete", () => {
  it("remove uma memória existente", () => {
    service.save("user.name", "Rafael", "profile");
    service.remove("user.name");
    const results = service.search("user.name");
    expect(results).toHaveLength(0);
  });
});

describe("SensitiveMemoryDetector", () => {
  it("detecta a palavra senha", () => {
    expect(SensitiveMemoryDetector.isSensitive("minha senha é abc123")).toBe(true);
  });

  it("detecta JWT token", () => {
    expect(SensitiveMemoryDetector.isSensitive("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c")).toBe(true);
  });

  it("não bloqueia valor normal", () => {
    expect(SensitiveMemoryDetector.isSensitive("Rafael")).toBe(false);
  });

  it("não salva dados sensíveis", () => {
    expect(() => service.save("credencial", "minha senha é abc123", "other")).toThrow();
  });
});

describe("memory_list", () => {
  it("agrupa por categoria", () => {
    service.save("user.name", "Rafael", "profile");
    service.save("project.tavernquest.path", "C:\\Projetos\\TavernQuest", "project");
    const grouped = service.listByCategory();
    expect(grouped["profile"]).toBeDefined();
    expect(grouped["project"]).toBeDefined();
  });
});
