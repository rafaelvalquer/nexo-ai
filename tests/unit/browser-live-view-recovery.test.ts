import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveViewService } from "../../packages/core/src/browser-agent/live-view-service";

afterEach(() => vi.useRealTimers());
describe("Live view recovery", () => {
  it("captures immediately and recovers a stalled screencast", async () => {
    vi.useFakeTimers();
    const frame = vi.fn();
    const live = new LiveViewService("r", "ws://localhost", frame, vi.fn());
    const internal = live as any;
    internal.send = vi.fn(async (method:string) => method === "Target.attachToTarget" ? {sessionId:"s"} : method === "Page.captureScreenshot" ? {data:"/9j/2Q=="} : {});
    await internal.queueSwitch("page");
    await Promise.resolve();
    expect(frame).toHaveBeenCalled();
    await internal.handleMessage(JSON.stringify({method:"Page.screencastFrame",sessionId:"s",params:{data:"/9j/2Q==",sessionId:1}}));
    const count = frame.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2500);
    expect(frame.mock.calls.length).toBeGreaterThan(count);
    await live.stop();
  });
  it("discards a screenshot from a detached session and prevents overlap", async () => {
    const frame = vi.fn();
    const live = new LiveViewService("r", "ws://localhost", frame, vi.fn());
    const internal = live as any;
    internal.targetSessionId = "old";
    let resolve!: (value:unknown)=>void;
    internal.send = vi.fn(()=>new Promise(r=>{resolve=r;}));
    const pending = internal.captureFallback();
    await internal.captureFallback();
    expect(internal.send).toHaveBeenCalledTimes(1);
    internal.targetSessionId = "new";
    resolve({data:"/9j/2Q=="});
    await pending;
    expect(frame).not.toHaveBeenCalled();
  });
});
