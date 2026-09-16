import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

export async function validateWrittenDocument(target: string, format: "txt" | "md" | "docx", expectedText: string) {
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size === 0) throw new Error("DOCUMENT_OUTPUT_INVALID");
  const extracted = format === "docx" ? (await mammoth.extractRawText({ path: target })).value : await fs.readFile(target, "utf8");
  const normalized = normalize(extracted);
  if (!normalized || !normalized.includes(normalize(expectedText).slice(0, Math.min(80, normalize(expectedText).length)))) throw new Error("DOCUMENT_CONTENT_VALIDATION_FAILED");
  if (path.extname(target).toLowerCase() !== `.${format}`) throw new Error("DOCUMENT_EXTENSION_MISMATCH");
  return { bytes: stat.size, extractedText: extracted };
}

function normalize(value: string) { return value.replace(/\s+/g, " ").trim(); }
