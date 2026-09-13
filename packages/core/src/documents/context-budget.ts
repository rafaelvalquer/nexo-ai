export const DOCUMENT_CONTEXT = {
  maxCharsPerBatch: 12_000,
  overlapChars: 500,
  maxRetrievedChunks: 8,
  maxChunkChars: 1_500,
  documentContextRatio: 0.7
} as const;

export function splitByCharacterBudget<T>(
  items: T[],
  serialize: (item: T) => string,
  maxChars = DOCUMENT_CONTEXT.maxCharsPerBatch
) {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;

  for (const item of items) {
    const size = serialize(item).length + (current.length ? 2 : 0);
    if (current.length && currentChars + size > maxChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += size;
  }

  if (current.length) batches.push(current);
  return batches;
}

export function truncateDocumentText(text: string, maxChars = DOCUMENT_CONTEXT.maxChunkChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
