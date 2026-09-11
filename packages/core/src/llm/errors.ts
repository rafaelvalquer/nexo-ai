export class OllamaUnavailableError extends Error {
  constructor(message: string = "Ollama indisponível") {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

export class OllamaTimeoutError extends Error {
  constructor(public phase: string, public model: string, public timeoutSeconds: number, message?: string) {
    super(message ?? `O modelo demorou mais que o esperado. Etapa: ${phase}. Tempo limite: ${timeoutSeconds} segundos.`);
    this.name = "OllamaTimeoutError";
  }
}

export class OllamaModelNotFoundError extends Error {
  constructor(model: string) {
    super(`O modelo ${model} não foi encontrado no Ollama.`);
    this.name = "OllamaModelNotFoundError";
  }
}

export class OllamaConnectionError extends Error {
  constructor(message: string = "Não consegui conectar ao Ollama. Verifique se o serviço local está em execução.") {
    super(message);
    this.name = "OllamaConnectionError";
  }
}

export class OllamaInvalidResponseError extends Error {
  constructor(message: string = "Resposta inválida ou vazia retornada pelo modelo.") {
    super(message);
    this.name = "OllamaInvalidResponseError";
  }
}
