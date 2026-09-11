export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<string>;
  stream(messages: LLMMessage[], onToken: (token: string) => void): Promise<string>;
  plan(messages: LLMMessage[]): Promise<string>;
  summarize(text: string): Promise<string>;
  embed(text: string): Promise<number[]>;
  health(): Promise<{ ok: boolean; detail: string }>;
  models(): Promise<string[]>;
}
