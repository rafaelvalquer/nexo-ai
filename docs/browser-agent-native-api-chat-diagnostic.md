# Browser Agent: diagnóstico `/v1/chat/completions` x `/api/chat`

Este diagnóstico compara, sem alterar o transporte de produção do Browser Agent, o tool calling do mesmo modelo Ollama nos dois endpoints:

- OpenAI-compatible: `/v1/chat/completions`
- API nativa Ollama: `/api/chat`

O modelo padrão é `qwen3:4b` e o Ollama padrão é `http://127.0.0.1:11434`.

## Executar

```powershell
pnpm diagnose:browser-model
```

Para informar explicitamente o modelo:

```powershell
pnpm diagnose:browser-model -- --model qwen3:4b
```

Também é possível alterar URL e timeout:

```powershell
pnpm diagnose:browser-model -- --model qwen3:4b --url http://127.0.0.1:11434 --timeout 20000
```

## Saída

O comando imprime somente JSON estruturado. Ele não imprime reasoning, prompt interno, tokens ou conteúdo bruto da resposta do modelo.

Os campos principais são:

- `openaiCompatible.toolCallDetected`
- `nativeApi.toolCallDetected`
- `comparison`

Valores possíveis de `comparison`:

- `both_support_tool_calling`: os dois endpoints produziram o tool call esperado.
- `native_api_only`: somente `/api/chat` produziu o tool call esperado. Esse resultado fornece evidência para avaliar uma migração do transporte do Browser Agent para a API nativa do Ollama.
- `openai_compatible_only`: somente `/v1/chat/completions` produziu o tool call esperado.
- `neither_endpoint_supports_tool_calling`: nenhum dos dois endpoints produziu o tool call esperado; nesse caso o próximo teste deve focar no modelo/template antes de alterar o transporte.

## Importante

Esta branch é exclusivamente diagnóstica. O Browser Agent continua usando o transporte OpenAI-compatible existente. Nenhuma migração para `/api/chat` é feita por este teste.
