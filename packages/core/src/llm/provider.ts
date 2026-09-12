export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LLMProvider {
  chat(messages: LLMMessage[], signal?: AbortSignal): Promise<string>;
  stream(messages: LLMMessage[], onToken: (token: string) => void, signal?: AbortSignal): Promise<string>;
  plan(messages: LLMMessage[], signal?: AbortSignal): Promise<string>;
  summarize(text: string): Promise<string>;
  embed(text: string): Promise<number[]>;
  health(): Promise<{ ok: boolean; detail: string }>;
  models(): Promise<string[]>;
}
