const HIDDEN_REASONING_TAGS = ["think", "analysis", "reasoning"] as const;

/** Removes hidden reasoning blocks/tags before assistant content can reach durable state or the UI. */
export function sanitizeAssistantContent(value?: string | null): string {
  let content = value?.trim() ?? "";
  if (!content) return "";

  content = content.replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // Some local models emit reasoning text followed only by a closing tag (for example `</think>`).
  // In that case, only the text after the last hidden-reasoning close tag is user-visible content.
  const lower = content.toLowerCase();
  let lastClosingIndex = -1;
  let closingLength = 0;
  for (const tag of HIDDEN_REASONING_TAGS) {
    const closing = `</${tag}>`;
    const index = lower.lastIndexOf(closing);
    if (index > lastClosingIndex) {
      lastClosingIndex = index;
      closingLength = closing.length;
    }
  }
  if (lastClosingIndex >= 0) content = content.slice(lastClosingIndex + closingLength);

  content = content
    .replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*$/gi, " ")
    .replace(/<\/?(think|analysis|reasoning)\b[^>]*>/gi, " ")
    .trim();

  return content;
}
