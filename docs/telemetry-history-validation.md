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

## Verificações

TypeScript: shared, core, renderer e Electron passaram. Browser-agent não foi alterado.

A suíte completa executada durante a implementação teve 487 testes aprovados e cinco falhas. As cinco falhas foram reproduzidas separadamente em uma cópia temporária do HEAD original `586d561`, sem as alterações desta entrega:

- `agent-email-send-tool-refresh`: mock sem `allowedFilesystemRoots`.
- `agent-v2-routing`: um caso de roteamento de browser e dois mocks sem `allowedRoots`.
- `authorized-filesystem-roots`: deduplicação de caminhos Windows com diferenças de maiúsculas/minúsculas.

A última execução direcionada passou em 26 testes (incluindo retenção). As regressões desta entrega cobrem buffering, prazo fixo, flush idempotente, falhas antes/depois do commit, backpressure, aprovação durável, backup, shutdown, migração, 551 mensagens, timestamps iguais, pertencimento, paginação durante atualizações, fechamento de conversa, falha/retry e recuperação de lacunas.

Os cenários Playwright `chat-history`, `chat-layout` e `chat-resources` passaram (10 casos distintos): paginação, posição de leitura, streaming, troca de chats, retry, cards e controles por teclado.

## Benchmark reproduzível

Após compilar shared e core:

```powershell
node scripts/benchmark-chat-persistence.mjs
```

O script usa duas cópias idênticas de um banco sintético de 1.593.344 bytes, 1.000 eventos de telemetria e 10 gravações operacionais explícitas por cenário. Não acessa dados do usuário. O buffer é descarregado ao final da carga, como no encerramento normal; o teste com relógio controlado verifica separadamente o prazo de 5 segundos.

Medição local em 16/09/2026, Node 22.16.0:

| Medida | Por evento (antes) | Em lote (depois) |
|---|---:|---:|
| Exportações de telemetria | 1.000 | 1 |
| Exportações operacionais | 10 | 10 |
| Amostras preservadas | 1.000 | 1.000 |
| Tempo em exportações | 2.793 ms | 28 ms |
| Tempo da carga | 3.410 ms | 244 ms |
| Atraso p95 do event loop | 179 ms | 23 ms |
| Atraso máximo do event loop | 185 ms | 29 ms |

Resultado sintético de uma execução, não uma garantia de desempenho da aplicação inteira. Tempos variam com disco, tamanho do banco e carga da máquina.
