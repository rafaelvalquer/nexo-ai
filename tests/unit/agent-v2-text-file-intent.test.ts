import path from "node:path";
import { describe, expect, it } from "vitest";
import { GoalBuilder } from "../../packages/core/src/agent/goal/goal-builder.js";
import { V2FastPathRouter } from "../../packages/core/src/agent/loop/v2-fast-path.js";
import { LocationRegistry } from "../../packages/core/src/locations/location-registry.js";
import { PathIntentResolver } from "../../packages/core/src/locations/path-intent-resolver.js";

describe("Agent V2 text-file intent", () => {
  const root = path.join(process.cwd(), ".nexo-agent-v2-text-intent");
  const downloads = path.join(root, "Downloads");
  const locations = new LocationRegistry({ home: root, downloads });

  it("does not include the content clause in the canonical destination", () => {
    const request = "Crie um arquivo chamado teste.txt dentro de Downloads\\NexoTeste\\SubPasta com o conteúdo: Teste de criação automática de diretórios pelo Nexo AI.";
    const task = new GoalBuilder(new PathIntentResolver(locations)).build(request);

    expect(task.goal.deliverables).toHaveLength(1);
    expect(task.goal.deliverables[0]).toMatchObject({
      requestedPath: "Downloads\\NexoTeste\\SubPasta\\teste.txt",
      resolvedPath: path.join(downloads, "NexoTeste", "SubPasta", "teste.txt"),
      pathResolutionStatus: "resolved",
    });
  });

  it("routes the literal request directly to create_text_file without an LLM decision", () => {
    const request = "Crie um arquivo chamado teste.txt dentro de Downloads\\NexoTeste\\SubPasta com o conteúdo: Teste de criação automática de diretórios pelo Nexo AI.";
    const router = new V2FastPathRouter(locations);
    const call = router.resolve(request, [{ name: "create_text_file" } as any]);

    expect(call).toMatchObject({
      name: "create_text_file",
      arguments: {
        path: path.join(downloads, "NexoTeste", "SubPasta", "teste.txt"),
        content: "Teste de criação automática de diretórios pelo Nexo AI.",
      },
    });
  });
});
