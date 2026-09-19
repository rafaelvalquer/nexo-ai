import {describe,expect,it} from "vitest";
import {buildAdjacencyMap,generateNeuralEdges} from "../../apps/desktop/renderer/components/ai/neural/neuralConnections";
import {generateNeuralNodes} from "../../apps/desktop/renderer/components/ai/neural/neuralGeometry";

describe("Neural Core connections",()=>{
  it("cria topologia válida com 3 a 5 conexões por nó no perfil balanced",()=>{
    const nodes=generateNeuralNodes(320);
    const edges=generateNeuralEdges(nodes,5);
    const keys=new Set<string>();
    const degrees=new Array(nodes.length).fill(0) as number[];

    for(const edge of edges){
      expect(edge.source).not.toBe(edge.target);
      expect(edge.source).toBeGreaterThanOrEqual(0);
      expect(edge.target).toBeLessThan(nodes.length);
      const key=`${Math.min(edge.source,edge.target)}:${Math.max(edge.source,edge.target)}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      degrees[edge.source]++;
      degrees[edge.target]++;
    }

    expect(Math.min(...degrees)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...degrees)).toBeLessThanOrEqual(5);
    const adjacency=buildAdjacencyMap(edges,nodes.length);
    expect(adjacency).toHaveLength(nodes.length);
    expect(adjacency.every(list=>list.length>=3&&list.length<=5)).toBe(true);
  });
});
