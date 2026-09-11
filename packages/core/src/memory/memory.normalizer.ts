export class MemoryNormalizer {
  static normalizeKey(key: string): string {
    return key.toLowerCase().trim().replace(/\s+/g, "_");
  }
}

export class SensitiveMemoryDetector {
  static isSensitive(value: string): boolean {
    const lower = value.toLowerCase();
    // Exemplo de heurística simples para dados sensíveis
    if (lower.includes("senha") || lower.includes("password")) return true;
    
    // Regras básicas para tokens/cartões (muito longos sem espaços podem ser keys, mas vamos simplificar)
    if (/\b(?:ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)\b/.test(value)) return true; // JWT
    if (/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/.test(value)) return true; // Cartão de crédito
    
    return false;
  }
}
