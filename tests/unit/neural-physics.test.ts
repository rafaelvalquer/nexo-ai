import {describe,expect,it} from "vitest";
import {getAutonomousDrift,getAutonomousRotation,getIdleEnergy} from "../../apps/desktop/renderer/components/ai/neural/neuralPhysics";

describe("Neural Core autonomous motion",()=>{
  it("muda de orientação mesmo sem pointer",()=>{
    expect(getAutonomousRotation(1)).not.toEqual(getAutonomousRotation(5));
  });

  it("mantém a rotação dentro dos limites orgânicos definidos",()=>{
    for(let time=0;time<=120;time+=.5){
      const rotation=getAutonomousRotation(time);
      expect(Math.abs(rotation.x)).toBeLessThanOrEqual(.091);
      expect(Math.abs(rotation.y)).toBeLessThanOrEqual(.156);
      expect(Math.abs(rotation.z)).toBeLessThanOrEqual(.026);
    }
  });

  it("mantém drift e energia idle em amplitudes discretas",()=>{
    for(let time=0;time<=120;time+=.5){
      const drift=getAutonomousDrift(time);
      expect(Math.abs(drift.x)).toBeLessThanOrEqual(.013);
      expect(Math.abs(drift.y)).toBeLessThanOrEqual(.011);
      expect(Math.abs(drift.z)).toBeLessThanOrEqual(.019);
      expect(getIdleEnergy(time)).toBeGreaterThanOrEqual(.84);
      expect(getIdleEnergy(time)).toBeLessThanOrEqual(1);
    }
  });
});
