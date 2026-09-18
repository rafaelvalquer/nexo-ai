import { LegacyIntentRouter } from "./legacy-intent-router.js";

export type DeterministicRoute =
  | { type: "tool"; tool: string; input: Record<string, unknown>; explanation?: string }
  | { type: "macro"; operation: string; input: Record<string, unknown>; explanation?: string }
  | { type: "chat"; response?: string; stream?: true }
  | { type: "unknown" };

/** Routes common requests into explicit command data; it never exposes planner plans. */
export class FastIntentRouter {
  private readonly legacyParser = new LegacyIntentRouter();

  route(text: string, options: { allowedRoots?: string[] } = {}): DeterministicRoute {
    const parsed = this.legacyParser.route(text, options);
    if (!parsed) return { type: "unknown" };
    const step = parsed.steps?.length === 1 ? parsed.steps[0] : undefined;
    const tool = step?.tool ?? parsed.tool;
    const input = step?.input ?? parsed.input ?? {};
    const explanation = step?.explanation ?? parsed.explanation;
    if (tool) return tool.startsWith("macro_")
      ? { type: "macro", operation: tool.slice("macro_".length), input, explanation }
      : { type: "tool", tool, input, explanation };
    if (typeof parsed.direct === "string") return { type: "chat", response: parsed.direct };
    if (parsed.directStream) return { type: "chat", stream: true };
    return { type: "unknown" };
  }
}
