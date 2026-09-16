import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { applyDocxEdit } from "./edit/docx-ooxml.js";
import type { NexoDatabase } from "../database/db.js";
import type { DocumentRecord } from "@nexo/shared";
import type { EmbeddingProvider } from "../rag/embeddings.js";

const MIME: Record<string, string> = { ".txt": "text/plain", ".md": "text/markdown", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pdf": "application/pdf" };
const supported = new Set(Object.keys(MIME));
const QUERY_STOP_WORDS = new Set(["a","o","as","os","de","da","do","das","dos","e","em","no","na","nos","nas","um","uma","uns","umas","por","para","com","sem","qual","quais","quando","quanto","onde","quem","como","que","sobre","existe","alguma","algum"]);
type Row = { id:string; name:string; mime_type:string; size_bytes:number; status:DocumentRecord["status"]; metadata_json?:string; created_at:string; updated_at:string; managed_path:string; source_hash:string };
type ChunkRow = { ordinal:number; locator?:string; text:string; embedding_json?:string };

export type RetrievedChunk = {
  documentId: string;
  documentName: string;
  ordinal: number;
  locator?: string;
  text: string;
  score: number;
};

export type RetrievalOptions = {
  limit?: number;
  maxChunkChars?: number;
};

export class DocumentService {
  constructor(private db: NexoDatabase, private dataDir: string, private maxSizeMb = 50, private embeddings?: EmbeddingProvider) {}
  listRecent() { return this.db.all<Row>("SELECT * FROM documents ORDER BY updated_at DESC LIMIT 30").map(r => this.public(r)); }
  get(id: string) { const r = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [id]); return r && this.public(r); }
  async waitUntilReady(ids:string[],options:{timeoutMs?:number;pollMs?:number;signal?:AbortSignal}={}){const deadline=Date.now()+(options.timeoutMs??45_000),pollMs=Math.max(100,options.pollMs??250);while(true){if(options.signal?.aborted)throw options.signal.reason??new DOMException("Cancelada pelo usuário.","AbortError");const records=ids.map(id=>this.get(id));if(records.some(record=>!record))throw new Error("Um ou mais documentos não estão disponíveis.");const failed=records.find(record=>record?.status==="failed");if(failed)throw new Error(`A indexação de ${failed.name} falhou.`);if(records.every(record=>record?.status==="ready"))return records as DocumentRecord[];if(Date.now()>=deadline)throw new Error("RESOURCE_WAIT_TIMEOUT: os documentos não ficaram prontos dentro de 45 segundos.");await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,pollMs);const abort=()=>{clearTimeout(timer);reject(options.signal?.reason??new DOMException("Cancelada pelo usuário.","AbortError"));};options.signal?.addEventListener("abort",abort,{once:true});});}}
  trustedPath(id: string) { const row = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [id]); if (!row) throw new Error("Documento não encontrado."); return this.latestVersionPath(id) ?? row.managed_path; }
  previewData(id: string) { const row = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [id]); if (!row) throw new Error("Documento não encontrado."); return { mimeType: row.mime_type, data: fs.readFileSync(this.trustedPath(id)) }; }
  export(id: string, destination: string) { fs.copyFileSync(this.trustedPath(id), destination); return { ok:true }; }
  latestVersionPath(documentId: string) { return this.db.get<{managed_path:string}>("SELECT managed_path FROM document_versions WHERE document_id=? ORDER BY version_number DESC LIMIT 1", [documentId])?.managed_path; }
  listVersions(documentId: string) { return this.db.all<{id:string;version_number:number;change_summary?:string;created_at:string}>("SELECT id,version_number,change_summary,created_at FROM document_versions WHERE document_id=? ORDER BY version_number DESC", [documentId]).map(row => ({ id:row.id, version:row.version_number, changeSummary:row.change_summary, createdAt:row.created_at })); }
  purgeOlderThan(cutoff: string) {
    const rows=this.db.all<Row>("SELECT * FROM documents WHERE updated_at < ?",[cutoff]); let removed=0;
    const root=path.resolve(this.dataDir,"documents");
    for(const row of rows) {
      const directory=path.resolve(path.dirname(row.managed_path));
      if (!directory.startsWith(root + path.sep)) continue;
      this.db.run("DELETE FROM document_chunks WHERE document_id=?",[row.id]); this.db.run("DELETE FROM document_versions WHERE document_id=?",[row.id]); this.db.run("DELETE FROM message_attachments WHERE document_id=?",[row.id]); this.db.run("DELETE FROM documents WHERE id=?",[row.id]);
      fs.rmSync(directory,{recursive:true,force:true}); removed++;
    }
    return removed;
  }
  async importFromTrustedPicker(source: string) {
    const ext = path.extname(source).toLowerCase(); if (!supported.has(ext)) throw new Error("Formato não suportado. Use PDF, DOCX, TXT ou MD.");
    const stat = fs.statSync(source); if (stat.size > this.maxSizeMb * 1024 * 1024) throw new Error(`Arquivo excede o limite de ${this.maxSizeMb} MB.`);
    const hash = createHash("sha256").update(fs.readFileSync(source)).digest("hex"); const known = this.db.get<Row>("SELECT * FROM documents WHERE source_hash=? AND status='ready'", [hash]); if (known) return this.public(known);
    const id = randomUUID(), now = new Date().toISOString(), dir = path.join(this.dataDir, "documents", id); fs.mkdirSync(dir, { recursive:true }); const managed = path.join(dir, `source${ext}`); fs.copyFileSync(source, managed);
    this.db.run("INSERT INTO documents(id,name,mime_type,size_bytes,managed_path,source_hash,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [id, path.basename(source), MIME[ext], stat.size, managed, hash, "extracting", now, now]);
    try {
      const chunks = await this.extract(managed, ext);
      if (ext === ".pdf" && chunks.reduce((sum, chunk) => sum + chunk.text.trim().length, 0) < 24) {
        throw new Error("Não consegui extrair texto suficiente deste PDF. Ele pode ser composto por imagens.");
      }
      this.db.run("UPDATE documents SET status='indexing',updated_at=? WHERE id=?", [new Date().toISOString(), id]);
      await this.indexChunks(id, chunks);
      this.db.run("UPDATE documents SET status='ready',metadata_json=?,updated_at=? WHERE id=?", [JSON.stringify({ chunkCount:chunks.length }), new Date().toISOString(), id]);
    } catch (error) {
      this.db.run("UPDATE documents SET status='failed',metadata_json=?,updated_at=? WHERE id=?", [JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), new Date().toISOString(), id]);
    }
    return this.get(id)!;
  }
  search(id: string, query: string) { const terms = queryTerms(query); return this.db.all<{ordinal:number;locator?:string;text:string}>("SELECT ordinal,locator,text FROM document_chunks WHERE document_id=?", [id]).map(x => ({...x, score:terms.reduce((n,t)=>n+(normalizeSearchText(x.text).includes(t)?1:0),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,8); }

  getChunks(documentId: string): RetrievedChunk[] {
    const document = this.get(documentId);
    if (!document) throw new Error("Documento não encontrado.");
    return this.db.all<ChunkRow>("SELECT ordinal,locator,text,embedding_json FROM document_chunks WHERE document_id=? ORDER BY ordinal", [documentId]).map(row => ({
      documentId,
      documentName: document.name,
      ordinal: Number(row.ordinal),
      locator: row.locator,
      text: row.text,
      score: 1
    }));
  }

  getChunksForDocuments(documentIds: string[]) {
    return [...new Set(documentIds)].flatMap(id => this.getChunks(id));
  }

  async retrieve(documentIds: string[], query: string, options: RetrievalOptions = {}): Promise<RetrievedChunk[]> {
    const limit = Math.max(1, options.limit ?? 8);
    const maxChunkChars = Math.max(100, options.maxChunkChars ?? 1_500);
    const results = (await Promise.all([...new Set(documentIds)].map(id => this.retrieveOne(id, query)))).flat();
    return results
      .sort((a,b) => b.score - a.score)
      .slice(0, limit)
      .map(result => ({ ...result, text: result.text.length > maxChunkChars ? `${result.text.slice(0, maxChunkChars - 1).trimEnd()}…` : result.text }));
  }

  retrieveMany(documentIds: string[], query: string, options: RetrievalOptions = {}) {
    return this.retrieve(documentIds, query, options);
  }

  async answer(ids: string[], query: string) {
    const matches = await this.retrieve(ids, query, { limit: 5 });
    if (!matches.length) return { text: "Não encontrei trechos correspondentes nos documentos anexados.", sources: [] };
    return { text: matches.map(match => `[${match.documentName} — ${match.locator ?? "trecho"}]\n${match.text.trim()}`).join("\n\n"), sources: matches.map(match => ({document:match.documentName, locator:match.locator})) };
  }
  compare(ids: string[]) {
    if (ids.length !== 2) throw new Error("Selecione exatamente dois documentos para comparar.");
    const [left, right] = ids.map(id => this.get(id)); if (!left || !right) throw new Error("Documento não encontrado.");
    const chunks = ids.map(id => this.db.all<{text:string;locator?:string}>("SELECT text,locator FROM document_chunks WHERE document_id=? ORDER BY ordinal", [id]));
    const normalize = (value:string) => value.toLowerCase().replace(/\s+/g," ").trim(); const rightSet = new Set(chunks[1].map(x=>normalize(x.text))); const leftSet = new Set(chunks[0].map(x=>normalize(x.text)));
    const onlyLeft = chunks[0].filter(x => !rightSet.has(normalize(x.text))).slice(0,8); const onlyRight = chunks[1].filter(x => !leftSet.has(normalize(x.text))).slice(0,8);
    return { left:{name:left.name,exclusive:onlyLeft}, right:{name:right.name,exclusive:onlyRight}, sharedChunkCount:chunks[0].filter(x=>rightSet.has(normalize(x.text))).length };
  }
  async applyEdit(documentId: string, plan: unknown) {
    const row = this.db.get<Row>("SELECT * FROM documents WHERE id=?", [documentId]); if (!row) throw new Error("Documento não encontrado.");
    if (path.extname(row.managed_path).toLowerCase() !== ".docx") throw new Error("A edição assistida está disponível somente para DOCX.");
    const edited = applyDocxEdit(fs.readFileSync(this.trustedPath(documentId)), plan); const version = (this.db.get<{ value:number }>("SELECT COALESCE(MAX(version_number), 0) AS value FROM document_versions WHERE document_id=?", [documentId])?.value ?? 0) + 1;
    const directory = path.dirname(row.managed_path); const output = path.join(directory, `version-${version}.docx`); fs.writeFileSync(output, edited.output);
    this.db.run("INSERT INTO document_versions(id,document_id,version_number,managed_path,change_summary,created_at) VALUES(?,?,?,?,?,?)", [randomUUID(), documentId, version, output, edited.plan.rationale, new Date().toISOString()]);
    const chunks = await this.extract(output, ".docx"); this.db.run("DELETE FROM document_chunks WHERE document_id=?", [documentId]); await this.indexChunks(documentId, chunks); this.db.run("UPDATE documents SET metadata_json=?,updated_at=? WHERE id=?", [JSON.stringify({ chunkCount: chunks.length, version }), new Date().toISOString(), documentId]);
    return { version, changeSummary: edited.plan.rationale, operations: edited.plan.operations, outputPath: output };
  }
  private async extract(file: string, ext: string) {
    if (ext === ".pdf") return this.extractPdf(file);
    let text = "";
    if (ext === ".txt" || ext === ".md") text = fs.readFileSync(file, "utf8");
    else if (ext === ".docx") { try { text = (await mammoth.extractRawText({ path: file })).value; } catch { text = extractDocxXmlText(file); } }
    else throw new Error("Formato não suportado.");
    return this.chunk(text, "Parágrafo");
  }
  private async indexChunks(documentId: string, chunks: Array<{text:string;locator:string}>) {
    for (const [ordinal, chunk] of chunks.entries()) {
      let embedding: number[] | undefined;
      try { embedding = this.embeddings ? await this.embeddings.embed(chunk.text) : undefined; } catch { /* Lexical retrieval remains available offline. */ }
      this.db.run("INSERT INTO document_chunks(id,document_id,ordinal,locator,text,embedding_json) VALUES(?,?,?,?,?,?)", [randomUUID(), documentId, ordinal, chunk.locator, chunk.text, embedding?.length ? JSON.stringify(embedding) : null]);
    }
  }
  private async retrieveOne(id: string, query: string): Promise<RetrievedChunk[]> {
    const document = this.get(id);
    if (!document) throw new Error("Documento não encontrado.");
    const lexical = this.search(id, query).map(row => ({ documentId:id, documentName:document.name, ordinal:Number(row.ordinal), locator:row.locator, text:row.text, score:row.score }));
    if (!this.embeddings) return lexical;
    let queryEmbedding: number[] = []; try { queryEmbedding = await this.embeddings.embed(query); } catch { return lexical; }
    const terms = queryTerms(query);
    const rows = this.db.all<ChunkRow>("SELECT ordinal,locator,text,embedding_json FROM document_chunks WHERE document_id=?", [id]);
    return rows.map(row => {
      const searchable = normalizeSearchText(row.text);
      const keyword = terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) / Math.max(1, terms.length);
      let vector: number[] = [];
      try { vector = row.embedding_json ? JSON.parse(row.embedding_json) as number[] : []; } catch { vector = []; }
      const semantic = cosine(queryEmbedding, vector);
      return { documentId:id, documentName:document.name, ordinal:Number(row.ordinal), locator:row.locator, text:row.text, score: semantic * 0.72 + keyword * 0.28 };
    }).filter(row => row.score > 0).sort((a,b) => b.score - a.score).slice(0, 8);
  }
  private async extractPdf(file: string) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); const loaded = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useWorkerFetch: false }).promise;
    const chunks: Array<{text:string;locator:string}> = []; for (let page = 1; page <= loaded.numPages; page++) { const content = await (await loaded.getPage(page)).getTextContent(); const text = content.items.map((item: any) => "str" in item ? item.str : "").join(" "); chunks.push(...this.chunk(text, `Página ${page}`)); } return chunks;
  }
  private chunk(text: string, locator: string) { const pieces:string[]=[]; for(let i=0;i<text.length;i+=1500) pieces.push(text.slice(Math.max(0,i-(i?200:0)),i+1500)); return pieces.filter(Boolean).map((piece,i)=>({text:piece,locator: locator.startsWith("Parágrafo") ? `${locator} ${i+1}` : (pieces.length === 1 ? locator : `${locator}, trecho ${i+1}`)})); }
  private public(r: Row): DocumentRecord { return { id:r.id,name:r.name,mimeType:r.mime_type,sizeBytes:r.size_bytes,status:r.status,metadata:r.metadata_json?JSON.parse(r.metadata_json):undefined,createdAt:r.created_at,updatedAt:r.updated_at }; }
}
function normalizeSearchText(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function queryTerms(query: string) { return normalizeSearchText(query).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).map(term=>term.trim()).filter(term=>term.length > 1 && !QUERY_STOP_WORDS.has(term)); }
function cosine(left: number[], right: number[]) { if (!left.length || left.length !== right.length) return 0; let dot=0, a=0, b=0; for (let i=0;i<left.length;i++) { dot+=left[i]*right[i]; a+=left[i]*left[i]; b+=right[i]*right[i]; } return a && b ? dot / Math.sqrt(a*b) : 0; }
function extractDocxXmlText(file: string) { const xml = new AdmZip(fs.readFileSync(file)).readAsText("word/document.xml"); return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) .join("\n"); }
