import { describe,expect,it } from "vitest";
import { StationSlotManager } from "../../../apps/desktop/renderer/pixel-office/agent/StationSlotManager";
describe("StationSlotManager",()=>{
  it("allocates distinct slots for four agents at the same station",()=>{const manager=new StationSlotManager();const points=["agent-1","agent-2","agent-3","agent-4"].map(id=>manager.reserve("mail-station",id));expect(new Set(points.map(point=>`${point.x}:${point.y}`)).size).toBe(4);});
  it("keeps a reservation stable and releases it when moving",()=>{const manager=new StationSlotManager();const first=manager.reserve("browser-station","agent-1");expect(manager.reserve("browser-station","agent-1")).toEqual(first);manager.moveReservation("agent-1","browser-station","system-station");expect(manager.snapshot()["browser-station"]??[]).toHaveLength(0);expect(manager.snapshot()["system-station"]).toHaveLength(1);});
});
