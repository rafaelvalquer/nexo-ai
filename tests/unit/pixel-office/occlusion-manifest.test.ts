import { describe,expect,it } from "vitest";
import { OCCLUSION_BANDS } from "../../../apps/desktop/renderer/pixel-office/data/occlusion-manifest";
import { OFFICE_HEIGHT,OFFICE_WIDTH } from "../../../apps/desktop/renderer/pixel-office/data/office-layout";
describe("occlusion manifest",()=>{
  it("covers the full office without gaps",()=>{expect(OCCLUSION_BANDS[0].y).toBe(0);expect(OCCLUSION_BANDS.at(-1)!.y+OCCLUSION_BANDS.at(-1)!.height).toBe(OFFICE_HEIGHT);expect(OCCLUSION_BANDS.every(band=>band.x===0&&band.width===OFFICE_WIDTH)).toBe(true);for(let i=1;i<OCCLUSION_BANDS.length;i++)expect(OCCLUSION_BANDS[i-1].y+OCCLUSION_BANDS[i-1].height).toBe(OCCLUSION_BANDS[i].y);});
  it("sorts deeper foreground rows after shallower rows",()=>{for(let i=1;i<OCCLUSION_BANDS.length;i++)expect(OCCLUSION_BANDS[i].sortY).toBeGreaterThan(OCCLUSION_BANDS[i-1].sortY);});
});
