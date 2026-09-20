import { generateNeuralEdges } from "./neuralConnections";
import { generateNeuralNodes, NEURAL_SEED } from "./neuralGeometry";
import type { NeuralQualityProfile } from "./types";

export type BrainTopologyProfile = "fallback"|"static"|Pick<NeuralQualityProfile,"nodeCount"|"maxConnections">;

export function generateBrainTopology(profile:BrainTopologyProfile,seed=NEURAL_SEED){
  const config=profile==="fallback"
    ?{nodeCount:72,maxConnections:4}
    :profile==="static"
      ?{nodeCount:96,maxConnections:4}
      :profile;
  const nodes=generateNeuralNodes(config.nodeCount,seed);
  const edges=generateNeuralEdges(nodes,config.maxConnections,`${seed}_EDGES`);
  return{nodes,edges,version:"brain-v1" as const};
}
