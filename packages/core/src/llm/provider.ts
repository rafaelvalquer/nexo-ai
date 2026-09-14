export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export type StructuredPlanRequest<T> = {
  messages: LLMMessage[];
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  schemaName?: string;
  model?: string;
};

export interface LLMProvider {
  chat(messages: LLMMessage[], signal?: AbortSignal): Promise<string>;
  stream(messages: LLMMessage[], onToken: (token: string) => void, signal?: AbortSignal): Promise<string>;
  plan(messages: LLMMessage[], signal?: AbortSignal): Promise<string>;
  /**
   * Structured planning is optional so test doubles and alternate providers remain compatible.
   * OllamaProvider implements it with native JSON Schema output.
   */
  planStructured?<T>(request: StructuredPlanRequest<T>, signal?: AbortSignal): Promise<T>;
  summarize(text: string): Promise<string>;
  embed(text: string): Promise<number[]>;
  health(): Promise<{ ok: boolean; detail: string }>;
  models(): Promise<string[]>;
}
