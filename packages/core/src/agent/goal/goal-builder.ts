import { randomUUID } from "node:crypto";
import path from "node:path";
import { PathIntentResolver } from "../../locations/path-intent-resolver.js";
import type { AgentResourceContext, AgentTaskState, GoalDeliverable, GoalStep } from "./goal-types.js";

export class GoalBuilder {
  constructor(private readonly pathResolver: PathIntentResolver = new PathIntentResolver()) {}

  build(objective: string, resources?: AgentResourceContext): AgentTaskState {
    const steps: GoalStep[] = [];
    const add = (description: string, domains: string[], capabilities?: string[]) => steps.push({ id: randomUUID(), description, status: "pending", requiredDomains: domains, requiredCapabilities: capabilities, attempts: [], maxAttempts: 3 });
    const paths = extractPaths(objective);
    const output = inferOutputTarget(objective, paths);
    if (/\bliste|\blistar/i.test(objective)) add("Listar os arquivos ou itens solicitados", ["filesystem"]);
    if (/procure|encontre|localize|busque|pesquise/i.test(objective)) add("Localizar a informação ou arquivo solicitado", ["filesystem", "document", "browser"]);
    if (resources?.documents.length || /pdf|docx|documento|arquivo anexado/i.test(objective)) add("Analisar o documento relevante", ["document"]);
    if (/resum/i.test(objective)) add("Produzir o resumo solicitado", ["document"]);
    if (/crie|salve|gravar|escreva|gerar|vers[aã]o/i.test(objective)) add("Criar o artefato solicitado", ["filesystem", "document"], ["filesystem.write"]);
    if (output) add("Validar o artefato físico produzido", ["filesystem", "document"]);
    if (/abra|abrir/i.test(objective)) add("Abrir o artefato concluído", ["system"]);
    for (let index = 1; index < steps.length; index++) steps[index].dependsOn = [steps[index - 1].id];

    const deliverables: GoalDeliverable[] = output ? [deliverableFrom(output, this.pathResolver)] : [];
    const consumed = new Set(output?.consumedPaths.map(item => item.toLowerCase()) ?? []);
    const inputPaths = paths.filter(candidate => !consumed.has(candidate.toLowerCase())).map(candidate => ({ id: randomUUID(), kind: "input" as const, description: `Arquivo de entrada ${candidate}`, path: candidate }));
    const documents = (resources?.documents ?? []).map(document => ({ id: randomUUID(), kind: "input" as const, description: `Documento ${document.name}`, documentId: document.id, path: document.path, mimeType: document.mimeType }));
    const constraints = deliverables.some(item => item.pathResolutionStatus === "needs_confirmation") ? ["O destino precisa ser confirmado antes de qualquer mutação."] : [];
    return { goal: { objective, status: "active", constraints, resources: [...inputPaths, ...documents], deliverables, steps }, currentStepId: steps[0]?.id, selectedToolNames: [], artifacts: [] };
  }
}

type OutputTarget = { requestedPath: string; kind: "file" | "directory"; consumedPaths: string[] };

function deliverableFrom(output: OutputTarget, resolver: PathIntentResolver): GoalDeliverable {
  const resolution = resolver.resolve(output.requestedPath);
  const resolvedPath = resolution.status === "resolved" ? resolution.resolvedPath : undefined;
  return {
    id: randomUUID(),
    description: `${output.kind === "directory" ? "Pasta" : "Arquivo"} ${resolvedPath ?? output.requestedPath}`,
    kind: output.kind,
    path: resolvedPath ?? output.requestedPath,
    requestedPath: output.requestedPath,
    resolvedPath,
    pathResolutionStatus: resolution.status,
    required: true,
    status: "pending",
  };
}

function inferOutputTarget(objective: string, paths: string[]): OutputTarget | undefined {
  const folder = objective.match(/(?:crie|criar|gere|gerar)\s+(?:uma?\s+)?(?:pasta|diret[oó]rio)\s+["']?([^"'.,\\/]+?)["']?\s+(?:em|no|na|nos|nas|para|dentro\s+de)\s+(.+?)(?:[.!?]|$)/i);
  if (folder) {
    const name = folder[1].trim();
    const destination = cleanDestination(folder[2]);
    if (name && destination) return { requestedPath: `${destination}\\${name}`, kind: "directory", consumedPaths: [] };
  }

  const semanticPath = objective.match(/(?:downloads?|documents?|documentos?|desktop|[áa]rea de trabalho|downlaod|donwload|dowload)(?:[\\/][^\r\n"',;]+)+\.(?:txt|md|docx|pdf)\b/i)?.[0];
  if (semanticPath && /crie|criar|gere|gerar|salve|salvar|grave|gravar|escreva|escrever|exporte|exportar|produza|produzir/i.test(objective)) {
    return { requestedPath: semanticPath, kind: "file", consumedPaths: [portableBasename(semanticPath)] };
  }

  const candidate = [...paths].reverse().find(item => isOutputPath(objective, item));
  if (!candidate) return undefined;
  if (isAbsolutePortable(candidate)) return { requestedPath: candidate, kind: "file", consumedPaths: [candidate] };
  const destination = destinationAfter(objective, candidate);
  return {
    requestedPath: destination ? `${destination}\\${candidate}` : candidate,
    kind: "file",
    consumedPaths: [candidate],
  };
}

function destinationAfter(objective: string, token: string) {
  const index = objective.toLowerCase().lastIndexOf(token.toLowerCase());
  if (index < 0) return undefined;
  const tail = objective.slice(index + token.length);
  const match = tail.match(/^\s+(?:em|no|na|nos|nas|para|dentro\s+de)\s+(.+?)(?:[.!?]|$)/i);
  return match ? cleanDestination(match[1]) : undefined;
}

function portableBasename(value: string) { return value.split(/[\\/]+/).filter(Boolean).at(-1) ?? value; }
function cleanDestination(value: string) {
  let cleaned = value.trim().replace(/^["']|["']$/g, "").replace(/[.!?]+$/g, "").trim();
  const contentClause = cleaned.search(/\s+(?:com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo|e\s+(?:escreva|grave|salve|coloque|adicione))\b/i);
  if (contentClause >= 0) cleaned = cleaned.slice(0, contentClause).trim();
  return cleaned.replace(/[,:;]+$/g, "").trim();
}
function isAbsolutePortable(value: string) { return path.isAbsolute(value) || path.win32.isAbsolute(value); }
function extractPaths(value: string) { return [...new Set([...value.matchAll(/[A-Za-z]:\\[^\r\n"',;]+?\.(?:txt|md|docx|pdf)\b|\b[\wÀ-ÿ_-]+\.(?:txt|md|docx|pdf)\b/gi)].map(match => match[0]))]; }
function isOutputPath(objective: string, target: string) { const index = objective.toLowerCase().lastIndexOf(target.toLowerCase()); const context = objective.slice(Math.max(0, index - 90), index + target.length + 30); return /(?:crie|criar|gere|gerar|salve|salvar|grave|gravar|escreva|escrever|exporte|exportar|produza|produzir|vers[aã]o)(?:.|\s){0,90}$/i.test(context.slice(0, Math.max(0, context.toLowerCase().lastIndexOf(target.toLowerCase())))) || /\b(?:em|como|para)\s+["']?$/i.test(context.slice(0, Math.max(0, context.toLowerCase().lastIndexOf(target.toLowerCase())))) && /(?:crie|gere|salve|grave|escreva|exporte|produza)/i.test(objective); }
