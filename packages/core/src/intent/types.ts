export const filesystemOperations = [
  "find_file",
  "list_files",
  "search_files",
  "create_folder",
  "create_text_file",
  "read_file",
  "write_text_file",
  "copy_file",
  "move_file",
  "rename_file",
  "trash_file",
  "file_info"
] as const;

export type FilesystemOperation = (typeof filesystemOperations)[number];
export type IntentDomain = "filesystem"|"system"|"web"|"email"|"calendar"|"documents"|"macro"|"chat"|"unknown";
export type IntentAction = "create"|"read"|"update"|"delete"|"find"|"list"|"open"|"execute"|"unknown";
export type IntentEntityValue = string|number|boolean|string[];
export type IntentEntitySource = "user"|"semantic_alias"|"previous_context"|"inferred";

export interface IntentEntity {
  value: IntentEntityValue;
  source: IntentEntitySource;
  confidence?: number;
}

export interface IntentAmbiguity {
  code: string;
  field?: string;
  message: string;
  critical?: boolean;
}

export interface CanonicalIntent {
  schemaVersion: 1;
  domain: IntentDomain;
  intent: IntentAction;
  operation: string;
  entities: Record<string, IntentEntity>;
  referencesPreviousResult: boolean;
  ambiguities: IntentAmbiguity[];
  missing: string[];
  source: "deterministic"|"llm";
  diagnostics?: {
    rawModelConfidence?: number;
    resolverVersion: string;
  };
}

export interface IntentConfidence {
  semantic: number;
  entities: number;
  schema: number;
  ambiguity: number;
  overall: number;
}

export interface IntentResolutionInput {
  text: string;
  allowedDomains?: string[];
  availableOperations: string[];
  context?: {
    previousDomain?: string;
    previousOperation?: string;
  };
  signal?: AbortSignal;
}

export type IntentResolutionResult =
  | { status:"resolved"; intent:CanonicalIntent; confidence:IntentConfidence }
  | { status:"clarification"; intent:CanonicalIntent; confidence:IntentConfidence; question:string }
  | { status:"unknown"; reason:string; intent?:CanonicalIntent; confidence?:IntentConfidence };

export interface NormalizedIntentLiteralSegment {
  type: "quoted"|"content"|"path";
  value: string;
  start: number;
  end: number;
}

export interface NormalizedIntentInput {
  original: string;
  /** Routing-only text: NFKC, normalized line endings and collapsed whitespace. */
  routingText: string;
  /** @deprecated compatibility alias for routingText during the RC. */
  normalized: string;
  literalSegments: NormalizedIntentLiteralSegment[];
  quoted: string[];
  explicitPaths: string[];
  extensions: string[];
}
