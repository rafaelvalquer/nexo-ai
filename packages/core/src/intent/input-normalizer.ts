import type { NormalizedIntentInput } from "./types.js";

const QUOTED=/["“”']([^"“”']+)["“”']/gu;
const WINDOWS_PATH=/\b[A-Za-z]:\\[^\n,;]+/gu;
const UNC_PATH=/\\\\[^\s]+(?:\\[^\s]+)*/gu;
const POSIX_PATH=/(?:^|\s)(\/[^\s,;]+)/gu;
const EXTENSION=/\.([A-Za-z0-9]{1,12})\b/gu;

export function normalizeIntentInput(text:string):NormalizedIntentInput{
  const original=text;
  // NFKC removes Unicode representation differences but intentionally leaves
  // casing, punctuation and internal whitespace untouched. File content must
  // reach the intent parser exactly as the user wrote it.
  const normalized=text.normalize("NFKC").replace(/\r\n?/g,"\n").trim();
  const quoted=[...normalized.matchAll(QUOTED)].map(match=>match[1]);
  const explicitPaths=[
    ...[...normalized.matchAll(WINDOWS_PATH)].map(match=>match[0].trim()),
    ...[...normalized.matchAll(UNC_PATH)].map(match=>match[0].trim()),
    ...[...normalized.matchAll(POSIX_PATH)].map(match=>match[1].trim())
  ];
  const extensions=[...new Set([...normalized.matchAll(EXTENSION)].map(match=>match[1].toLowerCase()))];
  return{original,normalized,quoted,explicitPaths,extensions};
}
