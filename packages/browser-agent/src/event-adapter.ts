/** Maps Pi events to safe, public progress labels. Raw model text is never forwarded. */
export class BrowserPublicEventMapper {
  private step = 0;

  map(event: unknown): { label: string; step: number; action: boolean } | undefined {
    if (!event || typeof event !== "object") return undefined;
    const data = event as Record<string, unknown>;
    const type = typeof data.type === "string" ? data.type : "";
    if (type === "message_update" || type === "agent_end") return undefined;
    const text = safeMetadata(data);
    let label: string | undefined;
    let action = false;
    if (/tool.*start|tool_execution_start|tool_call/i.test(type)) {
      label = this.fromToolText(text);
      action = true;
    } else if (/tool.*end|tool_execution_end/i.test(type)) label = "Etapa concluída";
    else if (/turn_start|agent_start/i.test(type)) label = "Analisando a página…";
    if (!label) return undefined;
    return { label, step: ++this.step, action };
  }

  private fromToolText(text: string) {
    if (/navigate|goto|location|href/i.test(text)) return "Abrindo página…";
    if (/scroll|wheel/i.test(text)) return "Percorrendo a página…";
    if (/click|press/i.test(text)) return "Abrindo conteúdo…";
    if (/type|fill|input/i.test(text)) return "Preenchendo informação…";
    if (/extract|textContent|innerText|accessibility|snapshot|read/i.test(text)) return "Lendo conteúdo…";
    return "Interagindo com a página…";
  }
}

function safeMetadata(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (key, item) => {
      if (/prompt|reason|thinking|token|credential|password|secret|cookie|content/i.test(key)) return undefined;
      if (item && typeof item === "object") {
        if (seen.has(item)) return undefined;
        seen.add(item);
      }
      return typeof item === "string" && item.length > 500 ? item.slice(0, 500) : item;
    });
  } catch {
    return "";
  }
}
