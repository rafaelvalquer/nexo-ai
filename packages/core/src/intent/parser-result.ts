import type { CanonicalIntent } from "./types.js";

export type IntentParserFailureKind =
  | "TIMEOUT"
  | "ABORTED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_NOT_FOUND"
  | "TRANSPORT_ERROR"
  | "INVALID_JSON"
  | "STRUCTURED_OUTPUT_ERROR"
  | "SCHEMA_VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

export type IntentParserResult =
  | {
      status: "success";
      intent: CanonicalIntent;
      latencyMs: number;
      model?: string;
    }
  | {
      status: "failure";
      kind: IntentParserFailureKind;
      latencyMs: number;
      model?: string;
      diagnosticCode?: string;
    };
