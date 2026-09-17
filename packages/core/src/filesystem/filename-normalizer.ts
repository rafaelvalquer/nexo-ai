/** Unicode-aware normalization used only for filename comparison, not paths. */
export function normalizeFilename(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}
