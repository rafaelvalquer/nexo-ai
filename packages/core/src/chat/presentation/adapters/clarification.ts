import type { ClarificationBlock } from "@nexo/shared";
import type { PresentationAdapter } from "../types.js";

export const clarificationAdapter: PresentationAdapter = (result) => {
  const block = result.data as ClarificationBlock | undefined;
  if (!block || block.type !== "clarification" || !block.clarificationId || !Array.isArray(block.questions)) return undefined;
  return { presentation: { version: 1, blocks: [block] }, bindings: [] };
};
