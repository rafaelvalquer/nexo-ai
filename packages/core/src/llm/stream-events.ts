export const LLM_STREAM_THINKING_STARTED = "\u0000NEXO_THINKING_STARTED\u0000";
export const LLM_STREAM_CONTENT_STARTED = "\u0000NEXO_CONTENT_STARTED\u0000";

export function isLlmStreamControlToken(token: string) {
  return token === LLM_STREAM_THINKING_STARTED || token === LLM_STREAM_CONTENT_STARTED;
}
