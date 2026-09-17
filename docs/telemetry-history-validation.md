# Telemetria em lotes e histórico paginado

## Comportamento

- Métricas são gravadas em uma transação após 5 segundos; o prazo começa na primeira amostra e não é renovado por novos eventos. Não há gravação de telemetria durante `record()`.
- O buffer aceita 10 mil amostras. Ao atingir o limite, agenda flush imediato fora de `record()`. Falhas são registradas no logger e tentadas novamente após 5 segundos; excedentes antigos podem ser descartados durante sobrecarga/falhas prolongadas.
- `snapshot()` e `latest()` incluem dados pendentes sem escrever. O encerramento normal e o backup descarregam o buffer. Aprovações e operações críticas continuam com persistência imediata.
- A janela de perda em encerramento abrupto é de até 5 segundos em operação normal. O banco continua usando exportação síncrona; esta entrega reduz a frequência dessas exportações.
- O chat abre nas últimas 50 mensagens. O botão no topo carrega páginas anteriores sem deslocar a mensagem visível. A sincronização preserva páginas antigas e recupera lacunas.
- `conversationMessagePage(id, { limit?, before? })` retorna `{ messages, hasMore, nextCursor? }`. Limite padrão 50, intervalo 1–200. O cursor contém `conversationId`, `createdAt` e `id`; a ordem é `(created_at, id)`.
- A API antiga de histórico continua retornando um array, agora com as últimas 200 mensagens. O contexto da IA usa o histórico recente do banco, não o estado de paginação da interface.
- A migração 17 adiciona o índice composto sem regravar mensagens. Aprovações antigas são verificadas por mensagem e conversa, independentemente da página aberta.
- Os comandos determinísticos cobrem abertura de apps/pastas, arquivos recentes, ordenação de processos, Web Reader e macros. “Resuma esta página” reutiliza a URL pública lida mais recentemente na mesma conversa; quando não existe referência, o roteador não inventa uma busca.
- A criação conversacional de macro pergunta o que fazer quando a pessoa fornece somente o nome, gera um rascunho validado pelo catálogo, aguarda confirmação explícita e salva como macro manual.
- A navegação principal contém Assistente, Macros, Ferramentas e Configurações. A automação do navegador segue opcional e as leituras de web passam pelo Web Reader.

## Verificações

TypeScript completo (`pnpm typecheck`) passou para shared, browser-agent, core e desktop. A suíte unitária e de segurança completa (`pnpm test`) passou em 126 arquivos e 539 testes. Os E2E direcionados de histórico, macros e navegação passaram (7/7); os testes da navegação agora verificam as quatro áreas acordadas e a ausência de overflow em viewport estreita. O instalador Windows x64 foi compilado para `release-final-5` e validado por cabeçalho PE e blockmap. As regressões cobrem buffering, prazo fixo, flush idempotente, falhas antes/depois do commit, backpressure, aprovação durável, backup, shutdown, migração, 551 mensagens, timestamps iguais, pertencimento, paginação durante atualizações, fechamento de conversa, falha/retry e recuperação de lacunas.

## Benchmark reproduzível

Após compilar shared e core:

```powershell
node scripts/benchmark-chat-persistence.mjs
```

O script usa duas cópias idênticas de um banco sintético de 1.593.344 bytes, 1.000 eventos de telemetria e 10 gravações operacionais explícitas por cenário. Não acessa dados do usuário. O buffer é descarregado ao final da carga, como no encerramento normal; o teste com relógio controlado verifica separadamente o prazo de 5 segundos.

Medição local em 17/09/2026, Node 22.19.0:

| Medida | Por evento (antes) | Em lote (depois) |
|---|---:|---:|
| Exportações de telemetria | 1.000 | 1 |
| Exportações operacionais | 10 | 10 |
| Amostras preservadas | 1.000 | 1.000 |
| Tempo em exportações | 14.010 ms | 187 ms |
| Tempo da carga | 16.791 ms | 547 ms |
| Atraso p95 do event loop | 1.245 ms | 61 ms |
| Atraso máximo do event loop | 1.255 ms | 80 ms |

Resultado sintético de uma execução, não uma garantia de desempenho da aplicação inteira. Tempos variam com disco, tamanho do banco e carga da máquina.
