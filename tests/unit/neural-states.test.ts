import {describe,expect,it} from "vitest";
import type {AgentVisualState} from "../../apps/desktop/renderer/design/tokens";
import {neuralColors,neuralStates} from "../../apps/desktop/renderer/components/ai/neural/neuralStates";

const states:AgentVisualState[]=["idle","interpreting","planning","executing-tool","awaiting-approval","responding","success","error","offline"];

describe("Neural Core visual states",()=>{
  it("cobre todos os estados existentes sem alterar o contrato do agente",()=>{
    for(const state of states){
      expect(neuralStates[state]).toBeDefined();
      expect(neuralColors[state]).toBeDefined();
      expect(neuralStates[state].twinkleStrength).toBeGreaterThanOrEqual(0);
      expect(neuralStates[state].shimmerStrength).toBeGreaterThanOrEqual(0);
    }
  });

  it("mantém idle vivo sem competir com estados de trabalho",()=>{
    expect(neuralStates.idle.pulseCount).toBe(10);
    expect(neuralStates.idle.pulseSpeed).toBeCloseTo(.46);
    expect(neuralStates.idle.autonomousRotation).toBe(1);
    expect(neuralStates.idle.spontaneousActivity).toBeGreaterThan(0);
    expect(neuralStates.offline.pulseCount).toBeLessThan(neuralStates.idle.pulseCount);
    expect(neuralStates["executing-tool"].pulseCount).toBeGreaterThan(neuralStates.idle.pulseCount);
    expect(neuralStates.planning.pulseCount).toBeGreaterThan(neuralStates.idle.pulseCount);
  });
});
