import type { BrowserFrame, BrowserRunEvent } from "@nexo/shared/browser-agent";

type EventListener = (event: BrowserRunEvent) => void;
type FrameListener = (frame: BrowserFrame) => void;

export class BrowserEventBus {
  private readonly eventListeners = new Set<EventListener>();
  private readonly frameListeners = new Set<FrameListener>();
  publish(event: BrowserRunEvent) { for (const listener of this.eventListeners) listener(event); }
  publishFrame(frame: BrowserFrame) { for (const listener of this.frameListeners) listener(frame); }
  subscribe(listener: EventListener) { this.eventListeners.add(listener); return () => this.eventListeners.delete(listener); }
  subscribeFrames(listener: FrameListener) { this.frameListeners.add(listener); return () => this.frameListeners.delete(listener); }
}
