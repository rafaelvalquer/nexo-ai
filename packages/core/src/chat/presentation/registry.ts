import type { PresentationAdapter } from "./types.js";

/** Only application code can register projections; provider content cannot add adapters. */
export class PresentationRegistry {
  private adapters = new Map<string, PresentationAdapter>();
  private fallback?:PresentationAdapter;
  registerFallback(adapter:PresentationAdapter){this.fallback=adapter;return this;}
  register(toolNames: string[], adapter: PresentationAdapter) {
    for (const name of toolNames) this.adapters.set(name, adapter);
    return this;
  }
  get(toolName: string) { return this.adapters.get(toolName); }
  getFallback(){return this.fallback;}
}
