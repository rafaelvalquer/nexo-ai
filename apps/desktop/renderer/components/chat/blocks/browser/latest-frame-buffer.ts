import type { BrowserFrame } from "@nexo/shared/browser-agent";

/** One-slot buffer: when rendering is slower than capture, only the newest frame survives. */
export class LatestFrameBuffer {
  private frame:BrowserFrame|null=null;
  push(frame:BrowserFrame) { if(!this.frame||frame.sequence>=this.frame.sequence)this.frame=frame; }
  take() { const frame=this.frame;this.frame=null;return frame; }
  clear() { this.frame=null; }
  get hasFrame() { return this.frame!==null; }
}
