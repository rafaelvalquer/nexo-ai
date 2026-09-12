# Nexo AI

Assistente pessoal local para Windows, com Electron + React + TypeScript, Core Node.js, Ollama, ferramentas controladas por políticas, automações e auditoria local.

## O que já funciona neste pacote

- Desktop Electron com React/Vite e navegação completa.
- Ollama local com detecção de saúde e seleção de modelo.
- Chat local e planner híbrido (regras determinísticas + LLM).
- Ferramentas de arquivos: listar, pesquisar, ler, metadados, criar pasta, copiar, mover, renomear, hash e ZIP.
- Diagnóstico do computador: hardware, memória, disco e processos.
- Browser Agent básico usando Chrome/Edge instalado, em contexto separado.
- Permission Engine por pastas autorizadas e nível de risco.
- Fila de aprovações para ações sensíveis.
- Histórico/auditoria em SQLite local (`sql.js`, sem dependência nativa).
- Memória explícita local.
- Automações por cron e base preparada para watcher de arquivos.
- Backup do banco.
- System tray e execução em background.
- Fastify em `127.0.0.1:47321/health` para diagnóstico local.
- Conexões Google/Microsoft via OAuth 2.0 com PKCE, callback local e cofre criptografado do Electron.
- E-mail e calendário por ferramentas de domínio com aprovação antes de envio/criação.
- Importação local de PDF, DOCX, TXT e MD; busca, comparação, exportação e prévia interna.
- Testes de política e segurança.
- Empacotamento Windows com electron-builder.

## Requisitos

- Windows 10/11 (desenvolvimento também funciona em macOS/Linux).
- Node.js 22 LTS.
- Git opcional.
- Ollama instalado para usar IA local: https://ollama.com/
- Um modelo local, recomendado para começar: `qwen3:4b`.

## Instalação rápida

No PowerShell, na pasta do projeto:

```powershell
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm install
ollama pull qwen3:4b
pnpm dev
```

Se o Windows negar `corepack enable` por permissão, execute o terminal como Administrador uma vez ou instale pnpm com `npm install -g pnpm`.

## Comandos

```powershell
pnpm dev          # desenvolvimento
pnpm typecheck    # valida TypeScript
pnpm test         # testes
pnpm build        # build de produção
pnpm package:win  # gera o instalador .exe em release/
```

## Primeiros comandos para testar

- `Veja por que meu computador está lento.`
- `Liste os arquivos da pasta Downloads.`
- `Mostre o uso de memória.`
- `Mostre o uso do disco.`

As ações em arquivos só funcionam dentro das pastas autorizadas em **Configurações > Pastas permitidas**.

## Conexões de escritório

Na versão instalada, abra **Conexões** e informe os Client IDs públicos da organização. Eles identificam o aplicativo e não são segredos; nunca informe um Client Secret. A configuração fica somente neste computador e os tokens permanecem no cofre criptografado do Windows, sem serem gravados no banco ou enviados ao Renderer.

- Google: crie um cliente OAuth de **aplicativo de desktop**, habilite Gmail API e Google Calendar API e configure a tela de consentimento. Em modo de teste, inclua os usuários autorizados.
- Microsoft: registre um aplicativo multitenant com contas pessoais, habilite **Allow public client flows** e, em **Mobile and desktop applications**, registre `http://localhost` como redirect URI. O tenant padrão `common` aceita contas corporativas/escolares e pessoais.

Durante o desenvolvimento, os mesmos valores também podem ser definidos em `.env` a partir de `.env.example`; a interface configurada tem precedência.

## Segurança

O Renderer não recebe Node.js. `nodeIntegration=false`, `contextIsolation=true` e `sandbox=true`. O LLM não executa comandos diretamente: ele solicita uma ferramenta ao Core, que valida schema, caminho, risco e aprovação. Conteúdo de browser é rotulado como `UNTRUSTED_CONTENT`.

## Dados locais

No Windows:

```text
%APPDATA%\NexoAI\
├── nexo.db
└── backups\
```

## Limites de release pública

Uma distribuição comercial ainda requer credenciais publicadas/verificadas pelos provedores OAuth, assinatura de código Windows e um canal de atualização assinado. Essas etapas dependem de contas e certificados da organização e não podem ser concluídas apenas no código-fonte.
