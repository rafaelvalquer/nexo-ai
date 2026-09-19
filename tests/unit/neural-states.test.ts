import {describe,expect,it} from "vitest";
import type {AgentVisualState} from "../../apps/desktop/renderer/design/tokens";
import {neuralColors,neuralStates} from "../../apps/desktop/renderer/components/ai/neural/neuralStates";

const states:AgentVisualState[]=["idle","interpreting","planning","executing-tool","awaiting-approval","responding","success","error","offline"];

describe("Neural Core visual states",()=>{
  it("cobre todos os estados existentes sem alterar o contrato do agente",()=>{
    for(const state of states){
      expect(neuralStates[state]).toBeDefined();
      expect(neuralColors[state]).toBeDefined();
    }
  });

  it("mantém atividade em idle e reduz atividade quando offline",()=>{
    expect(neuralStates.idle.pulseCount).toBeGreaterThan(0);
    expect(neuralStates.offline.pulseCount).toBeLessThan(neuralStates.idle.pulseCount);
    expect(neuralStates["executing-tool"].pulseCount).toBeGreaterThan(neuralStates.idle.pulseCount);
  });
});
