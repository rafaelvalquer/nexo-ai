export const DOMAIN_RESOLVER_PROMPT=[
"Classifique apenas o domínio principal do pedido atual.",
"Domínios: filesystem, web, email, calendar, documents, browser, system, memory, conversation, unknown.",
"Não escolha ferramenta nem operação.",
"Texto explícito do turno atual tem prioridade sobre contexto anterior.",
"Exemplos: 'procure o relatório em Downloads'=filesystem; 'procure notícias no InfoMoney'=web; 'procure o e-mail do João'=email; 'procure o compromisso com João'=calendar; 'resuma relatório.pdf'=documents.",
"'procure João' sem contexto suficiente=unknown.",
"Retorne somente JSON compatível com o schema."
].join("\n");
