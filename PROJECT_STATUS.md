# Status desta entrega

## Funcional nesta versão

- Electron + React + TypeScript + Vite.
- Tailwind habilitado e componentes UI locais no padrão shadcn.
- IPC seguro com `nodeIntegration=false`, `contextIsolation=true` e `sandbox=true`.
- Core Node.js com endpoint Fastify local de saúde.
- Ollama local, detecção, listagem de modelos e seleção de modelo.
- Planner local híbrido e execução por ferramentas.
- Plano multi-etapas para diagnóstico de computador lento.
- Ferramentas de arquivos com escopo de pasta e validação de caminhos.
- Lixeira com risco CRITICAL e aprovação.
- ZIP e extração com proteção contra path traversal.
- Diagnóstico de hardware, memória, disco e processos.
- Abertura segura de aplicativos conhecidos, URL, arquivo e pasta.
- Shell somente-leitura com allowlist.
- Browser Agent com perfil isolado, navegação, extração, abas, clique/digitação com aprovação e screenshot.
- Permission Engine com READ / WRITE / CRITICAL.
- Aprovações e histórico de auditoria.
- SQLite local via sql.js.
- Memória explícita local e Modo Privado impedindo novas memórias.
- Automações por cron e backend para file watcher.
- Backup local do banco.
- Logs locais com Pino.
- System Tray e execução em background.
- Build com electron-builder e CI GitHub Actions.
- Testes básicos de política e proteção de prompt.

## Estruturado, mas não conectado nesta entrega

Estes itens exigem configuração/credenciais específicas ou uma etapa de produto posterior e aparecem na interface/roadmap, mas não são anunciados como prontos:

- OAuth real de Gmail e Google Calendar.
- Catálogo genérico MCP com instalação de servidores externos.
- Voz local com whisper.cpp/TTS.
- Embeddings e busca vetorial semântica.
- Download/instalação automática do Ollama pelo próprio app.
- Auto-update publicado e assinado digitalmente.
- Assinatura de código do instalador Windows.

O projeto está preparado para desenvolvimento local e geração de instalador, mas uma release comercial pública ainda deve passar pelos itens acima, testes E2E em Windows real e assinatura do executável.
