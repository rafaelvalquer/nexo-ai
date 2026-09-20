import type { AmbientParticle, NeuralNode } from "./types";
import { BRAIN_BOUNDS, isPointInsideBrain } from "./brainOutline";
import { brainRegionFor } from "./brainRegions";

export const NEURAL_SEED = "NEXO_NEURAL_CORE_V1";

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed = NEURAL_SEED) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateNeuralNodes(count: number, seed = NEURAL_SEED): NeuralNode[] {
  const random=createSeededRandom(seed),nodes:NeuralNode[]=[];
  let attempts=0;
  while(nodes.length<count&&attempts<count*80){
    attempts++;
    const x=BRAIN_BOUNDS.minX+random()*(BRAIN_BOUNDS.maxX-BRAIN_BOUNDS.minX);
    const y=BRAIN_BOUNDS.minY+random()*(BRAIN_BOUNDS.maxY-BRAIN_BOUNDS.minY);
    if(!isPointInsideBrain(x,y))continue;
    const edgeBias=Math.min(1,Math.abs(y)/BRAIN_BOUNDS.maxY+Math.abs(x)/BRAIN_BOUNDS.maxX);
    const z=(random()-.5)*BRAIN_BOUNDS.maxZ*2*(.55+.35*(1-edgeBias*.3));
    const position:[number,number,number]=[x,y,z];
    nodes.push({
      id:nodes.length,
      position,
      basePosition:[...position],
      weight:.45+random()*.55,
      region:brainRegionFor(x,y),
      phase:random()*Math.PI*2
    });
  }
  if(nodes.length!==count)throw new Error(`Não foi possível gerar a topologia cerebral: ${nodes.length}/${count} nós.`);
  return nodes;
}

export function generateAmbientParticles(count: number, seed = `${NEURAL_SEED}_AMBIENT`): AmbientParticle[] {
  const random=createSeededRandom(seed),particles:AmbientParticle[]=[];
  for(let index=0;index<count;index++){
    particles.push({
      position:[
        -1.75+random()*3.5,
        -1.02+random()*2.04,
        -.28+random()*.56
      ],
      phase:random()*Math.PI*2,
      size:.45+random()*.72
    });
  }
  return particles;
}
