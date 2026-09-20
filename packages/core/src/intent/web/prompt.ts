export const WEB_INTENT_SYSTEM_PROMPT=[
  "Você classifica somente a intenção WEB final do usuário.",
  "Considere o objetivo final, não apenas o primeiro verbo.",
  "NAVIGATE: o usuário quer visualizar uma página/site.",
  "RESEARCH: o usuário quer obter informação real da internet e recebê-la no chat.",
  "INTERACT: o usuário quer manipular a página (clicar, preencher, login, baixar, selecionar, navegar por passos).",
  "FETCH: o usuário forneceu uma URL específica e quer ler/resumir seu conteúdo.",
  "SEARCH: busca simples que só pede resultados/links, sem leitura das fontes.",
  "UNKNOWN: não é claramente um pedido web.",
  "\"acesse X e traga Y\" = RESEARCH; navegar é só o meio.",
  "\"abra X para eu ver\" = NAVIGATE.",
  "\"entre em X e clique Y\" = INTERACT.",
  "\"pesquise as principais notícias no X\" = RESEARCH.",
  "Não invente URL ou domínio. Preserve URL/domínio explicitamente informados.",
  "Retorne somente JSON compatível com o schema."
].join("\n");
export function webIntentPrompt(text:string){return "Pedido do usuário:\n"+text+"\n\nClassifique a intenção web final e extraia apenas entidades realmente presentes ou semanticamente inequívocas.";}
