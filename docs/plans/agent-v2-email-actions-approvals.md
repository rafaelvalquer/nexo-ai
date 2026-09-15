# Plano técnico — Agent V2: ações de e-mail, capability de envio e approvals

## Objetivo

Corrigir as regressões observadas no Agent V2 em consultas e mutações de e-mail sem reintroduzir identificadores internos no contexto da LLM.

Os cenários-alvo são:

1. consultas de e-mail devem voltar a exibir Responder, Arquivar, Marcar como lido/não lido, Lixeira e Expandir;
2. seleção múltipla deve voltar a aparecer quando houver uma ação bulk válida;
3. pedidos de envio sem `email.send` operacional devem receber orientação determinística de reautorização;
4. approvals de mutações devem informar claramente o que será alterado antes da execução;
5. `connectionId` deve permanecer restrito ao Core e à camada privada de apresentação.

## Diagnóstico

### Perda do input efetivo no Agent V2

O Core resolve `connectionId` durante o preflight, mas o retorno do Agent V2 chegava à apresentação sem esse input. Como o `emailAdapter` só habilita ações quando conhece a conexão, os cards eram gerados com `actions: []`, o que também removia a seleção múltipla.

### Capability de envio

O catálogo capability-aware remove corretamente ferramentas cujo requisito não está operacional. Quando `email.send` não está ativo, porém, o modelo recebia apenas um catálogo sem ferramenta de envio e produzia uma explicação genérica. O produto já possui fluxo de reautorização em Conexões, então a correção deve direcionar o usuário para esse fluxo sem enfraquecer a política de capabilities.

### Approval genérico

O Agent V2 criava approvals com uma razão genérica. A infraestrutura de approval já suporta `preview`, `affectedCount` e `consequence`; o problema era a ausência de metadados específicos no caminho V2.

## Arquitetura da solução

### 1. Metadado privado de apresentação

A execução mantém dois contextos distintos:

- **contexto do modelo:** argumentos escolhidos pela LLM e observações sanitizadas;
- **contexto de apresentação:** input efetivo já resolvido pelo Core, incluindo `connectionId` quando necessário.

O resultado de ferramentas que geram cards de e-mail recebe um envelope interno contendo o input efetivo. Antes de qualquer observação ser serializada para a LLM, o envelope é removido. O `ChatPresentationBuilder` retira o envelope, restaura o input efetivo e entrega ao adapter apenas o payload original.

Garantias:

- `connectionId` não volta para `AgentModelMessage`;
- bindings privados da apresentação recuperam a conexão correta;
- paginação e ações de card continuam usando a conta efetivamente utilizada na execução;
- o mesmo mecanismo funciona no fast-path.

### 2. Remediação de `email.send`

Antes de chamar o modelo para um pedido explícito de envio, o Agent V2 consulta `ConnectionService.resolveForCapability("email.send")`.

Se estiver `ready`, o fluxo segue normalmente.

Se estiver indisponível, o run termina sem executar ferramentas e devolve uma mensagem determinística conforme o estado:

- nenhuma conta conectada;
- capability ausente;
- autorização expirada;
- reautorização necessária.

Para capability ausente, o usuário é direcionado ao fluxo existente:

`Conexões > Gerenciar conexão > Editar permissões > Enviar e-mails > Salvar e reautorizar`.

Nenhuma ferramenta de envio é exposta ou executada sem a capability operacional.

### 3. Approval detalhado

`ApprovalService` passa a enriquecer approvals cuja razão ainda seja a mensagem genérica do V2.

Metadados gerados por domínio:

- envio de e-mail: destinatários, assunto, corpo e consequência;
- lixeira/arquivo/lido/não lido: ação, quantidade e IDs exatos das mensagens;
- agenda: evento, datas e local quando disponíveis;
- filesystem e demais ferramentas: caminhos e consequência de mutação quando disponíveis.

Metadados fornecidos explicitamente por um fluxo especializado continuam tendo prioridade.

### 4. Seleção múltipla explícita

O Renderer deixa de inferir selecionabilidade pela ausência de ações desabilitadas. Um e-mail só recebe checkbox quando possui ao menos uma ação bulk habilitada:

- `email.trash`;
- `email.archive`;
- `email.mark_read`;
- `email.mark_unread`.

Isso evita que `actions: []` ou ações apenas de leitura gerem estados inconsistentes.

## Arquivos alterados

### Core

- `packages/core/src/agent/loop/agent-loop.ts`
- `packages/core/src/agent/loop/agent-loop-runner.ts`
- `packages/core/src/agent/orchestrator/email-capability-remediation.ts`
- `packages/core/src/chat/presentation/builder.ts`
- `packages/core/src/chat/presentation/internal-metadata.ts`
- `packages/core/src/permissions/approvals.ts`
- `packages/core/src/permissions/approval-presentation.ts`

### Renderer

- `apps/desktop/renderer/components/chat/blocks/ResourceCollection.tsx`

### Testes

- `tests/unit/agent-v2-email-presentation.test.ts`
- `tests/unit/agent-loop-presentation-metadata.test.ts`
- `tests/unit/approval-presentation.test.ts`
- `tests/unit/email-capability-remediation.test.ts`

## Testes de regressão

### Consulta de e-mail

Pedido: `quais são meus últimos emails?`

Esperado:

- resultado listado normalmente;
- cards com ações;
- binding contém o `connectionId` efetivamente resolvido;
- mensagens enviadas à LLM não contêm `connectionId`.

### Seleção múltipla

Selecionar dois ou mais e-mails.

Esperado:

- checkbox disponível quando houver ação bulk;
- barra de ações comuns;
- nenhuma seleção para cards sem mutação bulk válida.

### Envio sem capability

Pedido: `Envie e-mail para rafael@example.com falando Oi`.

Esperado:

- nenhuma tentativa de `email_send_composed`;
- nenhuma mutation;
- orientação de reautorização específica para `email.send`.

### Envio com capability

Após habilitar `email.send`:

- ferramenta volta ao catálogo;
- preflight resolve a conexão no Core;
- approval detalha destinatário, assunto e conteúdo;
- envio só ocorre depois da confirmação.

### Exclusão por linguagem natural

Pedido para mover uma mensagem específica para a lixeira.

Esperado:

- busca/leitura identifica a mensagem;
- mutation entra em `WAITING_APPROVAL`;
- approval deixa claro que o e-mail será alterado e qual ID será afetado;
- rejeição não executa mutation;
- aprovação executa uma única vez.

## Definition of Done

A correção é considerada concluída quando:

- [ ] `pnpm typecheck` passa;
- [ ] `pnpm test` passa;
- [ ] `pnpm build` passa;
- [ ] testes E2E existentes não apresentam regressão;
- [ ] listagem de e-mails no Agent V2 volta a produzir actions e bindings;
- [ ] `connectionId` não aparece em mensagens do modelo;
- [ ] fast-path também não persiste `connectionId` em `toolCalls.arguments`;
- [ ] seleção múltipla reaparece nos cards elegíveis;
- [ ] `email.send` ausente produz remediação determinística;
- [ ] approvals V2 exibem preview/consequência suficientes para decisão humana;
- [ ] nenhuma capability é bypassada;
- [ ] nenhuma mutation é executada antes da confirmação exigida.
