import { describe, expect, it } from "vitest";
import { parseFileIntent } from "../../packages/core/src/agent/intent/file-intent.js";

describe("FileIntentParser",()=>{
  it.each([
    "Procure arquivo Teste.txt",
    "Procure Teste.xlsx",
    "Ache o arquivo Meu Contrato 2026.pdf",
    'Procure "Meu Contrato 2026.pdf"',
    "Localize Caderno_de_Testes_Nexo_AI.txt"
  ])("detects exact filename without folder: %s", text=>expect(parseFileIntent(text)).toMatchObject({kind:"find_file",confidence:1}));
  it("extracts explicit folder and supports arbitrary Unicode extension",()=>expect(parseFileIntent("Procure 'relatório final.odt' em Downloads")).toMatchObject({kind:"find_file",fileName:"relatório final.odt",folder:"Downloads"}));
  it("does not include the command prefix in an unquoted filename",()=>expect(parseFileIntent("Procure arquivo relatorio.csv.")).toMatchObject({kind:"find_file",fileName:"relatorio.csv"}));
  it("keeps generic extension searches separate",()=>expect(parseFileIntent("Procure PDFs em Downloads")).toMatchObject({kind:"search_files",folder:"Downloads"}));
});
