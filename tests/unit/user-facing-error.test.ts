import { describe, expect, it } from "vitest";
import { userFacingError } from "../../apps/desktop/renderer/utils/user-facing-error";

describe("userFacingError", () => {
  it("replaces infrastructure details with contextual guidance in normal mode", () => {
    expect(userFacingError(new Error("Error invoking remote method: ECONNREFUSED 127.0.0.1:11434"), "Confira a conexão."))
      .toBe("Confira a conexão.");
  });

  it("preserves actionable validation messages in normal mode", () => {
    expect(userFacingError(new Error("Informe um nome para a macro."), "Tente novamente."))
      .toBe("Informe um nome para a macro.");
  });

  it("reveals infrastructure details only when diagnostics are enabled", () => {
    expect(userFacingError(new Error("ENOENT: no such file or directory"), "Tente novamente.", true))
      .toBe("ENOENT: no such file or directory");
  });

  it("uses the fallback for unknown error values", () => {
    expect(userFacingError({ code: "ERR" }, "Não foi possível concluir."))
      .toBe("Não foi possível concluir.");
  });
});
