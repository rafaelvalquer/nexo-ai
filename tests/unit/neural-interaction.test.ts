import {describe,expect,it} from "vitest";
import {createNeuralInteraction,decayInteraction,leavePointer,updatePointer} from "../../apps/desktop/renderer/components/ai/neural/neuralInteraction";
import {getTargetFrameInterval,shouldRenderNeuralScene} from "../../apps/desktop/renderer/components/ai/neural/neuralPerformance";

describe("Neural Core interaction and scheduling",()=>{
  it("normaliza o pointer, calcula velocidade e retorna suavemente ao repouso",()=>{
    const interaction=createNeuralInteraction();
    updatePointer(interaction,2,-2);
    expect(interaction.x).toBe(1);
    expect(interaction.y).toBe(-1);
    expect(interaction.speed).toBeGreaterThan(0);
    expect(interaction.wave).toBeGreaterThan(0);
    leavePointer(interaction);
    const before=Math.abs(interaction.x)+Math.abs(interaction.y);
    decayInteraction(interaction,.2);
    expect(Math.abs(interaction.x)+Math.abs(interaction.y)).toBeLessThan(before);
  });

  it("permite WebGL em idle e respeita reduced motion e visibilidade",()=>{
    expect(shouldRenderNeuralScene(true,false,true)).toBe(true);
    expect(shouldRenderNeuralScene(true,true,true)).toBe(false);
    expect(shouldRenderNeuralScene(true,false,false)).toBe(false);
  });

  it("usa 30 FPS em idle e 60 FPS durante interação",()=>{
    expect(getTargetFrameInterval("idle",false,true)).toBeCloseTo(1000/30);
    expect(getTargetFrameInterval("idle",true,true)).toBeCloseTo(1000/60);
    expect(getTargetFrameInterval("planning",false,true)).toBeCloseTo(1000/60);
  });
});
