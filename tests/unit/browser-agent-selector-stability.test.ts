import { describe, expect, it } from "vitest";
import type { BrowserRunEvent } from "@nexo/shared/browser-agent";
import {
  selectBrowserRunEvents,
  selectBrowserRunHistory,
  type BrowserRunState,
  type StoredEvent
} from "../../apps/desktop/renderer/stores/browser-runs";

describe("Browser Agent Zustand selector stability",()=>{
  it("returns the same empty events reference while the run is missing",()=>{
    const state={events:{}} as Pick<BrowserRunState,"events">;
    expect(selectBrowserRunEvents(state,"missing")).toBe(selectBrowserRunEvents(state,"missing"));
  });

  it("returns the same empty history reference while the run is missing",()=>{
    const state={history:{}} as Pick<BrowserRunState,"history">;
    expect(selectBrowserRunHistory(state,"missing")).toBe(selectBrowserRunHistory(state,"missing"));
  });

  it("preserves existing arrays instead of copying them",()=>{
    const events=[] as BrowserRunEvent[];
    const history=[] as StoredEvent[];
    expect(selectBrowserRunEvents({events:{run:events}},"run")).toBe(events);
    expect(selectBrowserRunHistory({history:{run:history}},"run")).toBe(history);
  });
});
