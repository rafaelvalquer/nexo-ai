const PRESENTATION_ENVELOPE_KEY = "__nexoPresentation";

type PresentationEnvelope = {
  input: Record<string, unknown>;
  data: unknown;
};

export function wrapPresentationData(data: unknown, input: Record<string, unknown>): unknown {
  return {
    [PRESENTATION_ENVELOPE_KEY]: {
      input: structuredClone(input),
      data
    } satisfies PresentationEnvelope
  };
}

export function unwrapPresentationData(data: unknown): { data: unknown; input?: Record<string, unknown> } {
  if (!isRecord(data)) return { data };
  const envelope = data[PRESENTATION_ENVELOPE_KEY];
  if (!isRecord(envelope) || !isRecord(envelope.input) || !("data" in envelope)) return { data };
  return { data: envelope.data, input: envelope.input };
}

export function modelVisiblePresentationData(data: unknown): unknown {
  return unwrapPresentationData(data).data;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
