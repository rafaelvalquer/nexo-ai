# Atualização — tarefas do Assistente em background

## O que mudou

- O envio do Assistente cria uma Task no Nexo Core e retorna imediatamente para a interface.
- A Task continua executando no processo principal mesmo ao trocar de tela.
- Conversas e resultados são persistidos no SQLite local.
- Ao voltar ao Assistente, o histórico é recarregado e o status é sincronizado.
- O menu Assistente exibe um indicador amarelo enquanto houver tarefa ativa.
- Fechar a janela com `Executar em background` habilitado apenas oculta o Nexo no tray; a Task continua.
- Se o processo inteiro do Nexo for encerrado durante uma Task, na próxima inicialização ela é marcada como interrompida. Retomada após reinicialização ainda não faz parte desta atualização.

## Como aplicar

1. Pare o ambiente atual com `Ctrl+C` no terminal que executa `pnpm dev`.
2. Substitua os arquivos do projeto pelos arquivos desta atualização mantendo a estrutura de pastas.
3. Na raiz `C:\Projetos\nexo-ai`, execute:

```powershell
pnpm --filter @nexo/shared build
pnpm --filter @nexo/core build
pnpm typecheck
pnpm test
pnpm dev
```

Não é necessário apagar `%APPDATA%\NexoAI\nexo.db`. A tabela de Tasks é criada automaticamente ao iniciar a nova versão.

## Teste recomendado

1. Entre em **Assistente**.
2. Envie: `Veja por que meu computador está lento.`
3. Assim que aparecer **Processando localmente…**, vá para **Configurações** ou **Hoje**.
4. O item **Assistente** continuará com um ponto amarelo pulsando.
5. Aguarde alguns segundos e volte para **Assistente**.
6. O resultado deverá estar no histórico. Se ainda estiver executando, o status **Executando em background** continuará visível.
7. Feche a janela pelo X, deixando o Nexo no tray, e repita um teste mais demorado. Ao reabrir pelo tray, o estado será sincronizado.
