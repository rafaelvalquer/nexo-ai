# Migração dos testes E2E

Inventário da suíte após a simplificação da navegação e reintegração do Escritório. Os testes de produto devem seguir a interface atual; cobertura histórica de fluxos ainda válidos permanece, mesmo quando usa cenários Electron mais longos.

| Arquivo | Situação | Ação |
|---|---|---|
| `assistant.e2e.ts` | Current | Substitui `nexo-nucleus.e2e.ts`; cobre navegação atual, sidebar responsiva/persistente e paleta. |
| `chat-history.e2e.ts` | Current | Manter; cobre paginação e sincronização do histórico. |
| `chat-resources.e2e.ts` | Current | Manter; cobre cartões de recursos no chat, teclado e confirmação inline. |
| `chat-resources-electron.e2e.ts` | Current | Manter; cobre anexos reais e aprovação de renomeação no Electron. |
| `macros.e2e.ts` | Current | Manter; cobre editor, validação, simulação e execução. |
| `settings.e2e.ts` | Current | Manter; cobre Configurações e diagnóstico condicionado. |
| `connections.e2e.ts` | Rewrite | Abrir Configurações > Contas e integrações antes de verificar Google/Microsoft. |
| `pixel-office.e2e.ts` | Rewrite | Entrar pela navegação Escritório e validar eventos reais; não navegar por tela Hoje. |
| `pixel-office-scene.e2e.ts` | Current | Manter; cobre estados e movimento dos sprites. |
| `agent-v2-location-filesystem.e2e.ts` | Current | Manter; cobre resolução de caminhos e correção antes de aprovação. |
| `agent-v2-multistep-electron.e2e.ts` | Current | Manter; cobre aprovação, política de escrita e recuperação de execução. |

Os cenários de arquivos, aprovações e recuperação ainda estão agrupados nos arquivos Electron existentes. A extração para suítes menores só será feita quando evitar duplicar setup caro e mantiver os mesmos asserts de segurança.
