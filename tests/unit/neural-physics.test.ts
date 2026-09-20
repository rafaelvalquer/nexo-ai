import {describe,expect,it} from "vitest";
import {getAutonomousDrift,getAutonomousRotation,getIdleEnergy} from "../../apps/desktop/renderer/components/ai/neural/neuralPhysics";

describe("Neural Core autonomous motion",()=>{
  it("mantém micro movimento sem giro de esfera",()=>{
    expect(getAutonomousRotation(1)).not.toEqual(getAutonomousRotation(5));
    for(let time=0;time<=120;time+=.5){
      const rotation=getAutonomousRotation(time);
      expect(Math.abs(rotation.x)).toBeLessThanOrEqual(.012);
      expect(Math.abs(rotation.y)).toBeLessThanOrEqual(.050);
      expect(Math.abs(rotation.z)).toBeLessThanOrEqual(.006);
    }
  });

  it("mantém drift e energia idle em amplitudes discretas",()=>{
    for(let time=0;time<=120;time+=.5){
      const drift=getAutonomousDrift(time);
      expect(Math.abs(drift.x)).toBeLessThanOrEqual(.011);
      expect(Math.abs(drift.y)).toBeLessThanOrEqual(.009);
      expect(Math.abs(drift.z)).toBeLessThanOrEqual(.005);
      expect(getIdleEnergy(time)).toBeGreaterThanOrEqual(.84);
      expect(getIdleEnergy(time)).toBeLessThanOrEqual(1);
    }
  });
});
