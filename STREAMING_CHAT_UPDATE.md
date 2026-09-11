# Nexo AI — Streaming Chat Update

Esta versão melhora a experiência do Assistente em dois pontos:

- reduz o espaçamento vertical entre as mensagens;
- exibe o andamento da tarefa e a resposta do Ollama em streaming enquanto ela é gerada.

## Comportamento

Durante uma tarefa, o Assistente mostra o estágio atual, por exemplo:

- Interpretando seu pedido com a IA local…
- Ollama está gerando a resposta…
- Verificando uso de memória…
- Analisando processos em execução…

Para respostas conversacionais, os tokens do Ollama aparecem progressivamente no balão do Assistente, com cursor de digitação.

A execução continua no Core caso o usuário navegue para outra página. Ao retornar ao Assistente, o texto parcial atual é recuperado da tarefa que continua ativa no processo principal.

## Aplicação do patch

Pare o Nexo (`Ctrl+C`), copie os arquivos do patch sobre o projeto e execute:

```powershell
cd C:\Projetos\nexo-ai
pnpm --filter @nexo/shared build
pnpm --filter @nexo/core build
pnpm typecheck
pnpm test
pnpm dev
```

Não é necessário excluir `node_modules` nem o banco `nexo.db`.
