export type DocumentCitationSource = {
  id: string;
  documentId: string;
  documentName: string;
  locator?: string;
};

export function renderDocumentCitations(text: string, sources: DocumentCitationSource[]) {
  const byId = new Map(sources.map(source => [source.id.toUpperCase(), source]));
  return text
    .replace(/\[S(\d+)\]/gi, (_match, number: string) => {
      const id = `S${number}`.toUpperCase();
      const source = byId.get(id);
      if (!source) return "";
      return `[${source.documentName} — ${source.locator ?? "trecho"}]`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
