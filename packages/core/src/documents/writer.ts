import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { validateWrittenDocument } from "./document-validator.js";

export type DocumentFormat = "txt" | "md" | "docx";
export type DocumentWriteRequest = { path: string; format: DocumentFormat; title?: string; content: string; createOnly?: boolean; executionId?: string };

export class DocumentWriterService {
  async write(request: DocumentWriteRequest) {
    const bytes = documentOutputBuffer(request.format, request.content, request.title);
    const target = path.resolve(request.path);
    const exists = await fs.stat(target).then(() => true, error => (error as NodeJS.ErrnoException).code === "ENOENT" ? false : Promise.reject(error));
    if (request.createOnly !== false && exists) throw new Error("FILE_ALREADY_EXISTS");
    await fs.access(path.dirname(target));
    const temporary = path.join(path.dirname(target), `.nexo-temp-${request.executionId ?? "document"}-${path.basename(target)}`);
    const handle = await fs.open(temporary, "wx");
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    try {
      if (sha256(await fs.readFile(temporary)) !== sha256(bytes)) throw new Error("TEMPORARY_CONTENT_HASH_MISMATCH");
      if (request.createOnly !== false) { await fs.link(temporary, target); await fs.unlink(temporary); }
      else await fs.rename(temporary, target);
      const validation = await validateWrittenDocument(target, request.format, request.content);
      const hash = sha256(await fs.readFile(target));
      return { path: target, bytesWritten: validation.bytes, sha256: hash, created: !exists, extractedText: validation.extractedText };
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }
}

export function documentOutputBuffer(format: DocumentFormat, content: string, title?: string): Buffer {
  if (format === "txt" || format === "md") return Buffer.from(content, "utf8");
  const zip = new AdmZip();
  add(zip, "[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  add(zip, "_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const paragraphs = [...(title ? [title] : []), ...content.split(/\r?\n/)];
  const body = paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`).join("");
  add(zip, "word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return zip.toBuffer();
}

function add(zip: AdmZip, name: string, value: string) { zip.addFile(name, Buffer.from(value, "utf8")); const entry = zip.getEntry(name); if (entry) entry.header.time = new Date("1980-01-01T00:00:00.000Z"); }
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sha256(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
