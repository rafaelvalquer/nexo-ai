import { describe, expect, it } from "vitest";
import { intentOperationContracts } from "../../../packages/core/src/intent/operation-contracts.js";

describe("operation contracts", () => {
  it("garante que allowedEntities é a união exata de requiredEntities e optionalEntities sem duplicatas", () => {
    for (const [opName, contract] of Object.entries(intentOperationContracts)) {
      const combined = [...contract.requiredEntities, ...contract.optionalEntities];
      const uniqueCombined = new Set(combined);

      expect(combined.length, `Operação ${opName} possui duplicatas entre required e optional`).toBe(uniqueCombined.size);
      expect(new Set(contract.allowedEntities), `Operação ${opName} possui desalinhamento em allowedEntities`).toEqual(uniqueCombined);
    }
  });
});
