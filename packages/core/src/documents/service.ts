import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { applyDocxEdit } from "./edit/docx-ooxml.js";
import type { NexoDatabase } from "../database/db.js";
import type { DocumentRecord } from "@nexo/shared";

const MIME: Record<string, string> = { ".txt": "text/plain", ".md": "text/markdown", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pdf": "application/pdf" };
const supported = new Set(Object.keys(MIME));
type Row = { id:string; name:string; mime_type:string; size_bytes:number; status:DocumentRecord["status"]; metadata_json?:string; created_at:string; updated_at:string; managed_path:string; source_hash:string };
export class DocumentService {
  constructor(private db: NexoDatabase, private dataDir: string, private maxSizeMb = 50) {}
  listRecent() { return this.db.all<Row>("SELECT * FROM documents ORDER BY updated_at DESC LIMIT 30").map(r => this.public(r)); }
  get(id: string) { const r = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [id]); return r && this.public(r); }
  trustedPath(id: string) { const row = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [id]); if (!row) throw new Error("Documento não encontrado."); return row.managed_path; }
  previewData(id: string) { const row = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [id]); if (!row) throw new Error("Documento não encontrado."); return { mimeType: row.mime_type, data: fs.readFileSync(row.managed_path) }; }
  export(id: string, destination: string) { const source = this.db.get<{managed_path:string}>("SELECT managed_path FROM document_versions WHERE document_id=? ORDER BY version_number DESC LIMIT 1", [id])?.managed_path ?? this.trustedPath(id); fs.copyFileSync(source, destination); return { ok:true }; }
  async importFromTrustedPicker(source: string) {
    const ext = path.extname(source).toLowerCase(); if (!supported.has(ext)) throw new Error("Formato não suportado. Use PDF, DOCX, TXT ou MD.");
    const stat = fs.statSync(source); if (stat.size > this.maxSizeMb * 1024 * 1024) throw new Error(`Arquivo excede o limite de ${this.maxSizeMb} MB.`);
    const hash = createHash("sha256").update(fs.readFileSync(source)).digest("hex"); const known = this.db.get<Row>("SELECT * FROM documents WHERE source_hash=? AND status='ready'", [hash]); if (known) return this.public(known);
    const id = randomUUID(), now = new Date().toISOString(), dir = path.join(this.dataDir, "documents", id); fs.mkdirSync(dir, { recursive:true }); const managed = path.join(dir, `source${ext}`); fs.copyFileSync(source, managed);
    this.db.run("INSERT INTO documents(id,name,mime_type,size_bytes,managed_path,source_hash,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [id, path.basename(source), MIME[ext], stat.size, managed, hash, "extracting", now, now]);
    try { const chunks = await this.extract(managed, ext); this.db.run("UPDATE documents SET status='indexing',updated_at=? WHERE id=?", [new Date().toISOString(), id]); chunks.forEach((chunk, ordinal) => this.db.run("INSERT INTO document_chunks(id,document_id,ordinal,locator,text) VALUES(?,?,?,?,?)", [randomUUID(), id, ordinal, chunk.locator, chunk.text])); this.db.run("UPDATE documents SET status='ready',metadata_json=?,updated_at=? WHERE id=?", [JSON.stringify({ chunkCount:chunks.length }), new Date().toISOString(), id]); } catch (error) { this.db.run("UPDATE documents SET status='failed',metadata_json=?,updated_at=? WHERE id=?", [JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), new Date().toISOString(), id]); }
    return this.get(id)!;
  }
  search(id: string, query: string) { const terms = query.toLowerCase().split(/\s+/).filter(Boolean); return this.db.all<{locator?:string;text:string}>("SELECT locator,text FROM document_chunks WHERE document_id=?", [id]).map(x => ({...x, score:terms.reduce((n,t)=>n+(x.text.toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,8); }
  answer(ids: string[], query: string) {
    const matches = ids.flatMap(id => this.search(id, query).map(result => ({ document: this.get(id)?.name ?? id, ...result }))).sort((a,b) => b.score - a.score).slice(0, 5);
    if (!matches.length) return { text: "Não encontrei trechos correspondentes nos documentos anexados.", sources: [] };
    return { text: matches.map(match => `[${match.document} — ${match.locator ?? "trecho"}]\n${match.text.trim()}`).join("\n\n"), sources: matches.map(({document, locator}) => ({ document, locator })) };
  }
  compare(ids: string[]) {
    if (ids.length !== 2) throw new Error("Selecione exatamente dois documentos para comparar.");
    const [left, right] = ids.map(id => this.get(id)); if (!left || !right) throw new Error("Documento não encontrado.");
    const chunks = ids.map(id => this.db.all<{text:string;locator?:string}>("SELECT text,locator FROM document_chunks WHERE document_id=? ORDER BY ordinal", [id]));
    const normalize = (value:string) => value.toLowerCase().replace(/\s+/g," ").trim(); const rightSet = new Set(chunks[1].map(x=>normalize(x.text))); const leftSet = new Set(chunks[0].map(x=>normalize(x.text)));
    const onlyLeft = chunks[0].filter(x => !rightSet.has(normalize(x.text))).slice(0,8); const onlyRight = chunks[1].filter(x => !leftSet.has(normalize(x.text))).slice(0,8);
    return { left:{name:left.name,exclusive:onlyLeft}, right:{name:right.name,exclusive:onlyRight}, sharedChunkCount:chunks[0].filter(x=>rightSet.has(normalize(x.text))).length };
  }
  applyEdit(documentId: string, plan: unknown) {
    const row = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [documentId]); if (!row) throw new Error("Documento não encontrado.");
    if (path.extname(row.managed_path).toLowerCase() !== ".docx") throw new Error("A edição assistida está disponível somente para DOCX.");
    const edited = applyDocxEdit(fs.readFileSync(row.managed_path), plan); const version = (this.db.get<{ value:number }>("SELECT COALESCE(MAX(version_number), 0) AS value FROM document_versions WHERE document_id=?", [documentId])?.value ?? 0) + 1;
    const directory = path.dirname(row.managed_path); const output = path.join(directory, `version-${version}.docx`); fs.writeFileSync(output, edited.output);
    this.db.run("INSERT INTO document_versions(id,document_id,version_number,managed_path,change_summary,created_at) VALUES(?,?,?,?,?,?)", [randomUUID(), documentId, version, output, edited.plan.rationale, new Date().toISOString()]);
    return { version, changeSummary: edited.plan.rationale, operations: edited.plan.operations, outputPath: output };
  }
  private async extract(file: string, ext: string) {
    if (ext === ".pdf") return this.extractPdf(file);
    let text = "";
    if (ext === ".txt" || ext === ".md") text = fs.readFileSync(file, "utf8");
    else if (ext === ".docx") text = (await mammoth.extractRawText({ path: file })).value;
    else throw new Error("Formato não suportado.");
    return this.chunk(text, "Parágrafo");
  }
  private async extractPdf(file: string) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); const loaded = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useWorkerFetch: false }).promise;
    const chunks: Array<{text:string;locator:string}> = []; for (let page = 1; page <= loaded.numPages; page++) { const content = await (await loaded.getPage(page)).getTextContent(); const text = content.items.map((item: any) => "str" in item ? item.str : "").join(" "); chunks.push(...this.chunk(text, `Página ${page}`)); } return chunks;
  }
  private chunk(text: string, locator: string) { const pieces:string[]=[]; for(let i=0;i<text.length;i+=1500) pieces.push(text.slice(Math.max(0,i-(i?200:0)),i+1500)); return pieces.filter(Boolean).map((piece,i)=>({text:piece,locator: locator.startsWith("Parágrafo") ? `${locator} ${i+1}` : (pieces.length === 1 ? locator : `${locator}, trecho ${i+1}`)})); }
  private public(r: Row): DocumentRecord { return { id:r.id,name:r.name,mimeType:r.mime_type,sizeBytes:r.size_bytes,status:r.status,metadata:r.metadata_json?JSON.parse(r.metadata_json):undefined,createdAt:r.created_at,updatedAt:r.updated_at }; }
}
