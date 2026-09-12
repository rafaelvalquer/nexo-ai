import AdmZip from "adm-zip";
import { docxEditPlanSchema, type DocxEditPlan } from "./plan.js";

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeXmlAttribute = (value: string) => escapeXml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const paragraphText = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<")).join("");
const textRun = (text: string, properties = "") => `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const newParagraph = (text: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${escapeXmlAttribute(style)}"/></w:pPr>` : ""}${textRun(text)}</w:p>`;

export function applyDocxEdit(input: Buffer, rawPlan: unknown) {
  const plan = docxEditPlanSchema.parse(rawPlan); const zip = new AdmZip(input); const name = "word/document.xml"; let xml = zip.readAsText(name);
  const before = xml; let paragraphs: string[] = xml.match(paragraphPattern) ?? [];
  const get = (index: number) => { if (!paragraphs[index]) throw new Error(`Parágrafo ${index + 1} não encontrado.`); return paragraphs[index]; };
  for (const op of plan.operations) {
    if (op.type === "replace_text") { let seen = 0; let changed = false; paragraphs = paragraphs.map(p => { const text = paragraphText(p); if (!text.includes(op.find) || (op.occurrence && ++seen !== op.occurrence)) return p; changed = true; return replaceTextPreservingRuns(p, op.find, op.replace); }); if (!changed) throw new Error(`Texto não encontrado: ${op.find}`); }
    if (op.type === "replace_paragraph") paragraphs[op.locator.paragraph] = replaceParagraphText(get(op.locator.paragraph), op.text);
    if (op.type === "delete_paragraph") paragraphs.splice(op.locator.paragraph, 1);
    if (op.type === "insert_after") paragraphs.splice(op.locator.paragraph + 1, 0, newParagraph(op.text, op.style));
    if (op.type === "insert_before") paragraphs.splice(op.locator.paragraph, 0, newParagraph(op.text, op.style));
  }
  // `String.replace` only invokes the callback for paragraphs that existed in
  // the original document.  When an edit inserts paragraphs, append the tail
  // that no longer has an original slot immediately before the section
  // properties (which must remain the last child of w:body).
  let cursor = 0;
  xml = xml.replace(paragraphPattern, () => paragraphs[cursor++] ?? "");
  const remainingParagraphs = paragraphs.slice(cursor).join("");
  if (remainingParagraphs) {
    xml = /<w:sectPr(?:\s[^>]*)?>/.test(xml)
      ? xml.replace(/<w:sectPr(?:\s[^>]*)?>/, match => `${remainingParagraphs}${match}`)
      : xml.replace(/<\/w:body>/, `${remainingParagraphs}</w:body>`);
  }
  zip.updateFile(name, Buffer.from(xml));
  for (const op of plan.operations) {
    if (op.type === "set_table_cell") xml = setTableCell(xml, op.table, op.row, op.column, op.text);
    if (op.type === "fill_content_control") xml = fillContentControl(xml, op.tag, op.text);
  }
  zip.updateFile(name, Buffer.from(xml));
  return { output: zip.toBuffer(), changed: before !== xml, plan: plan as DocxEditPlan };
}

function setTableCell(xml: string, tableIndex: number, rowIndex: number, columnIndex: number, text: string) {
  const tables = xml.match(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g) ?? []; const table = tables[tableIndex];
  if (!table) throw new Error(`Tabela ${tableIndex + 1} não encontrada.`);
  const rows = table.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) ?? []; const row = rows[rowIndex]; if (!row) throw new Error(`Linha ${rowIndex + 1} não encontrada na tabela.`);
  const cells = row.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) ?? []; const cell = cells[columnIndex]; if (!cell) throw new Error(`Coluna ${columnIndex + 1} não encontrada na tabela.`);
  const replacement = replaceContainerText(cell, text); const nextRow = row.replace(cell, replacement); const nextTable = table.replace(row, nextRow);
  return xml.replace(table, nextTable);
}

function fillContentControl(xml: string, tag: string, text: string) {
  const controls = xml.match(/<w:sdt(?:\s[^>]*)?>[\s\S]*?<\/w:sdt>/g) ?? [];
  const control = controls.find(item => new RegExp(`<w:tag\\s+[^>]*w:val="${escapeRegExp(tag)}"`).test(item));
  if (!control) throw new Error(`Controle de conteúdo não encontrado: ${tag}`);
  return xml.replace(control, replaceContainerText(control, text));
}

function replaceContainerText(container: string, text: string) {
  const paragraphs = container.match(paragraphPattern) ?? []; const original = paragraphs.at(0); if (!original) throw new Error("O alvo DOCX não contém um parágrafo editável.");
  const first = replaceParagraphText(original, text);
  return container.replace(original, first);
}
function replaceParagraphText(paragraph: string, text: string) {
  // New content inherits the first textual run's formatting, while paragraph
  // properties, bookmarks and other paragraph-level Word structures remain.
  const firstRun = paragraph.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/)?.[0] ?? "";
  const properties = firstRun.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  return paragraph.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, "").replace(/<\/w:p>$/, `${textRun(text, properties)}</w:p>`);
}
function replaceTextPreservingRuns(paragraph: string, find: string, replacement: string) {
  const textNode = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g; let replaced = false;
  const preserved = paragraph.replace(textNode, (_all, open: string, text: string, close: string) => {
    if (replaced || !text.includes(find)) return `${open}${text}${close}`;
    replaced = true; return `${open}${text.replace(find, escapeXml(replacement))}${close}`;
  });
  if (replaced) return preserved;
  const text = paragraphText(paragraph);
  return replaceParagraphText(paragraph, text.replace(find, replacement));
}
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
