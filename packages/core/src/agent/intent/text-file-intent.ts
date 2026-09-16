export type ParsedTextFileIntent = {
  fileName: string;
  destination: string;
  content: string;
};

const FILE_REQUEST = /\b(?:crie|criar|gere|gerar|salve|salvar|grave|gravar|escreva|escrever)\s+(?:(?:um|uma|o|a)\s+)?(?:arquivo(?:\s+(?:de\s+texto|textual))?(?:\s+chamad[oa])?\s+)?["']?([\wÀ-ÿ ._-]+\.(?:txt|md))["']?/i;
const DESTINATION_PREFIX = /^\s+(?:(?:especificamente|exatamente|diretamente|somente|apenas)\s+)*(?:em|no|na|nos|nas|para|dentro\s+de)\s+/i;
const CONTENT_MARKER = /\s+(?:com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo)\b\s*:?\s*/i;

export function parseTextFileIntent(text: string): ParsedTextFileIntent | undefined {
  const request = text.match(FILE_REQUEST);
  if (!request || request.index === undefined) return undefined;

  const tail = text.slice(request.index + request[0].length);
  const destinationPrefix = tail.match(DESTINATION_PREFIX);
  if (!destinationPrefix) return undefined;

  const remainder = tail.slice(destinationPrefix[0].length);
  const contentMarker = remainder.match(CONTENT_MARKER);
  if (!contentMarker || contentMarker.index === undefined) return undefined;

  const destination = cleanDestination(remainder.slice(0, contentMarker.index));
  const content = remainder.slice(contentMarker.index + contentMarker[0].length).trim();
  const fileName = request[1]?.trim();
  if (!fileName || !destination || !content) return undefined;

  return { fileName, destination, content };
}

export function containsPathTraversal(value: string) {
  return value.split(/[\\/]+/).some(segment => segment.trim() === "." || segment.trim() === "..");
}

function cleanDestination(value: string) {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[,:;]+$/g, "")
    .trim();
}
