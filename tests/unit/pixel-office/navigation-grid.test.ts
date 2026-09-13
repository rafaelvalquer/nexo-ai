import { describe,expect,it } from "vitest";
import { Grid } from "../../../apps/desktop/renderer/pixel-office/navigation/Grid";
import { OFFICE_STATIONS } from "../../../apps/desktop/renderer/pixel-office/data/office-layout";
describe("grade de navegação",()=>{
  it("mantém todas as estações e slots alcançáveis",()=>{const grid=new Grid();for(const station of Object.values(OFFICE_STATIONS)){expect(grid.isWalkable(grid.toGrid(station.x,station.y)),station.id).toBe(true);for(const slot of station.slots)expect(grid.isWalkable(grid.toGrid(slot.x,slot.y)),`${station.id} slot`).toBe(true);}});
  it("usa a grade refinada de 32px",()=>{const grid=new Grid();expect(grid.cellSize).toBe(32);expect(grid.toGrid(760,650)).toEqual({x:24,y:20});expect(grid.toWorld({x:24,y:20})).toEqual({x:768,y:640});});
});
