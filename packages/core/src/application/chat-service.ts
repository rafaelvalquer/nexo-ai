import type { LLMMessage, LLMProvider } from "../llm/provider.js";

const SYSTEM_PROMPT=[
  "Você é o Nexo AI, um assistente local.",
  "Responda em português de forma clara e objetiva.",
  "Responda somente ao pedido do usuário.",
  "Não exponha raciocínio interno ou cadeia de pensamento.",
  "Não afirme que executou ações no computador nesta resposta.",
  "Quando uma solicitação exigir ferramenta ou alteração, ela será tratada pelo Core; não finja que executou nada."
].join("\n");

/** Plain chat streaming; deterministic commands and tools do not pass through this service. */
export class ChatService {
  constructor(private readonly llm:LLMProvider){}
  stream(text:string,onToken:(token:string)=>void,context:LLMMessage[]=[],signal?:AbortSignal){
    return this.llm.stream([{role:"system",content:SYSTEM_PROMPT},...context,{role:"user",content:text}],onToken,signal);
  }
}
