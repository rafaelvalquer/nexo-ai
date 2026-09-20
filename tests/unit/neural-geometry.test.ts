import {describe,expect,it} from "vitest";
import {generateAmbientParticles,generateNeuralNodes} from "../../apps/desktop/renderer/components/ai/neural/neuralGeometry";

describe("Neural Core geometry",()=>{
  it("gera nós determinísticos nos dois hemisférios",()=>{
    const first=generateNeuralNodes(320),second=generateNeuralNodes(320);
    expect(first).toEqual(second);
    expect(first).toHaveLength(320);
    expect(first.some(node=>node.position[0]<0)).toBe(true);
    expect(first.some(node=>node.position[0]>0)).toBe(true);
    for(const node of first){
      expect(node.position.every(Number.isFinite)).toBe(true);
      expect(node.region).toBeGreaterThanOrEqual(0);
      expect(node.region).toBeLessThan(6);
    }
  });

  it("gera a nuvem ambiente sem aleatoriedade entre renders",()=>{
    const first=generateAmbientParticles(130),second=generateAmbientParticles(130);
    expect(first).toEqual(second);
    expect(first).toHaveLength(130);
  });
});
