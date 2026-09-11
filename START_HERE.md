# Nexo AI — como iniciar no Windows

## 1. Instale os pré-requisitos

Instale:

1. **Node.js 22 LTS** — https://nodejs.org/
2. **Ollama** — https://ollama.com/
3. **Google Chrome ou Microsoft Edge** — necessário apenas para o Browser Agent.

Abra um novo PowerShell após a instalação.

## 2. Entre na pasta do projeto

Exemplo:

```powershell
cd C:\Projetos\nexo-ai
```

## 3. Ative o pnpm

```powershell
corepack enable
corepack prepare pnpm@10.15.1 --activate
```

Se o Windows bloquear o `corepack enable`, abra o PowerShell como Administrador uma vez. Como alternativa:

```powershell
npm install -g pnpm
```

## 4. Instale as dependências

```powershell
pnpm install
```

## 5. Baixe o modelo local

```powershell
ollama pull qwen3:4b
```

Confirme que o Ollama está ativo:

```powershell
ollama list
```

## 6. Inicie o Nexo AI

```powershell
pnpm dev
```

A janela do Electron será aberta automaticamente.

## 7. Primeiros testes

No Assistente, tente:

```text
Veja por que meu computador está lento.
Mostre o uso de memória.
Mostre o uso do disco.
Liste os arquivos da pasta Downloads.
Abra o Chrome.
```

Para operações de arquivo, confira as pastas liberadas em **Configurações > Pastas permitidas**.

## 8. Validar o projeto

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## 9. Gerar instalador Windows

```powershell
pnpm package:win
```

O instalador será criado em:

```text
release\NexoAI-Setup-0.1.0.exe
```

## 10. Dados locais

O banco e os backups são gravados em:

```text
%APPDATA%\NexoAI\
```

O banco é local e o modelo padrão usa Ollama local. Nenhuma API externa de LLM é necessária.
