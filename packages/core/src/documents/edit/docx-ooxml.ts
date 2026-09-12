import AdmZip from "adm-zip";
import { docxEditPlanSchema, type DocxEditPlan } from "./plan.js";

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const paragraphText = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<")).join("");
const textRun = (text: string) => `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

export function applyDocxEdit(input: Buffer, rawPlan: unknown) {
  const plan = docxEditPlanSchema.parse(rawPlan); const zip = new AdmZip(input); const name = "word/document.xml"; let xml = zip.readAsText(name);
  const before = xml; let paragraphs: string[] = xml.match(paragraphPattern) ?? [];
  const get = (index: number) => { if (!paragraphs[index]) throw new Error(`Parágrafo ${index + 1} não encontrado.`); return paragraphs[index]; };
  for (const op of plan.operations) {
    if (op.type === "replace_text") { let seen = 0; let changed = false; paragraphs = paragraphs.map(p => { const text = paragraphText(p); if (!text.includes(op.find) || (op.occurrence && ++seen !== op.occurrence)) return p; changed = true; return p.replace(/<w:r[\s\S]*?<\/w:r>/g, "").replace(/<\/w:p>$/, `${textRun(text.replace(op.find, op.replace))}</w:p>`); }); if (!changed) throw new Error(`Texto não encontrado: ${op.find}`); }
    if (op.type === "replace_paragraph") paragraphs[op.locator.paragraph] = get(op.locator.paragraph).replace(/<w:r[\s\S]*?<\/w:r>/g, "").replace(/<\/w:p>$/, `${textRun(op.text)}</w:p>`);
    if (op.type === "delete_paragraph") paragraphs.splice(op.locator.paragraph, 1);
    if (op.type === "insert_after") paragraphs.splice(op.locator.paragraph + 1, 0, `<w:p>${textRun(op.text)}</w:p>`);
    if (op.type === "insert_before") paragraphs.splice(op.locator.paragraph, 0, `<w:p>${textRun(op.text)}</w:p>`);
    if (op.type === "set_table_cell" || op.type === "fill_content_control") throw new Error(`A operação ${op.type} ainda não é suportada para este DOCX.`);
  }
  let cursor = 0; xml = xml.replace(paragraphPattern, () => paragraphs[cursor++] ?? ""); zip.updateFile(name, Buffer.from(xml));
  return { output: zip.toBuffer(), changed: before !== xml, plan: plan as DocxEditPlan };
}
