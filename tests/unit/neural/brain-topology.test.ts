import {describe,expect,it} from "vitest";
import {BRAIN_BOUNDS,isPointInsideBrain} from "../../../apps/desktop/renderer/components/ai/neural/brainOutline";
import {generateBrainTopology} from "../../../apps/desktop/renderer/components/ai/neural/brainTopology";
import {buildAdjacencyMap} from "../../../apps/desktop/renderer/components/ai/neural/neuralConnections";

describe("Neural Core brain topology",()=>{
  it("é determinística e mantém silhueta lateral 2.5D",()=>{
    const first=generateBrainTopology({nodeCount:320,maxConnections:5});
    const second=generateBrainTopology({nodeCount:320,maxConnections:5});
    expect(first).toEqual(second);
    const xs=first.nodes.map(node=>node.position[0]),ys=first.nodes.map(node=>node.position[1]),zs=first.nodes.map(node=>node.position[2]);
    const width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
    expect(width/height).toBeGreaterThan(1.45);
    expect(width/height).toBeLessThan(2.20);
    expect(Math.max(...zs)-Math.min(...zs)).toBeLessThanOrEqual(BRAIN_BOUNDS.maxZ*2+.001);
    for(const node of first.nodes)expect(isPointInsideBrain(node.position[0],node.position[1])).toBe(true);
  });

  it("gera grafo conectado com grau e comprimento controlados",()=>{
    const {nodes,edges}=generateBrainTopology({nodeCount:320,maxConnections:5});
    const adjacency=buildAdjacencyMap(edges,nodes.length);
    const degree=new Array(nodes.length).fill(0);
    for(const edge of edges){
      degree[edge.source]++;degree[edge.target]++;
      const a=nodes[edge.source].position,b=nodes[edge.target].position;
      expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeLessThanOrEqual(1.26);
    }
    expect(Math.min(...degree)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...degree)).toBeLessThanOrEqual(5);
    const seen=new Set([0]),queue=[0];
    while(queue.length){
      const node=queue.shift()!;
      for(const edgeIndex of adjacency[node]){
        const edge=edges[edgeIndex],next=edge.source===node?edge.target:edge.source;
        if(!seen.has(next)){seen.add(next);queue.push(next);}
      }
    }
    expect(seen.size).toBe(nodes.length);
  });
});
