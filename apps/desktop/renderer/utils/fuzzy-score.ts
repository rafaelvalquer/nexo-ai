/** Returns a deterministic relevance score, or -1 when the query is not present. */
export function fuzzyScore(source: string, query: string): number {
  const needle = normalize(query.trim());
  if (!needle) return 1;

  const haystack = normalize(source);
  const exactIndex = haystack.indexOf(needle);
  if (exactIndex >= 0) {
    const atWordStart = exactIndex === 0 || /\s/.test(haystack[exactIndex - 1]);
    return 1000 + (atWordStart ? 100 : 0) - exactIndex;
  }

  let cursor = 0;
  let score = 0;
  let previousIndex = -2;
  for (const character of needle) {
    const index = haystack.indexOf(character, cursor);
    if (index < 0) return -1;

    const contiguous = index === previousIndex + 1;
    const wordStart = index === 0 || /[\s/_.-]/.test(haystack[index - 1]);
    score += wordStart ? 12 : contiguous ? 7 : 2;
    if (contiguous) score += 3;
    score -= Math.min(index, 40) * 0.05;
    previousIndex = index;
    cursor = index + 1;
  }
  return score;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}
