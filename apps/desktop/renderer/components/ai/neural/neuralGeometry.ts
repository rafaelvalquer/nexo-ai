import type { AmbientParticle, NeuralNode } from "./types";

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

function regionFor(x: number, y: number) {
  const side = x < 0 ? 0 : 1;
  if (y > 0.22) return side;
  if (y < -0.22) return 4 + side;
  return 2 + side;
}

export function generateNeuralNodes(count: number, seed = NEURAL_SEED): NeuralNode[] {
  const random = createSeededRandom(seed);
  const nodes: NeuralNode[] = [];
  for (let index = 0; index < count; index++) {
    const hemisphere = index % 2 === 0 ? -1 : 1;
    const u = Math.max(0.0001, random());
    const v = random();
    const w = random();
    const theta = Math.acos(1 - 2 * u);
    const phi = Math.PI * 2 * v;
    const radial = Math.cbrt(0.2 + 0.8 * w);
    const sinTheta = Math.sin(theta);

    let x = Math.cos(phi) * sinTheta * radial * 1.04 + hemisphere * 0.38;
    let y = Math.cos(theta) * radial * 0.82;
    let z = Math.sin(phi) * sinTheta * radial * 0.72;

    const groove = Math.max(0, 0.22 - Math.abs(x));
    x += hemisphere * groove * 0.52;
    x += (random() - 0.5) * 0.12;
    y += (random() - 0.5) * 0.10;
    z += (random() - 0.5) * 0.14;

    const position: [number, number, number] = [x, y, z];
    nodes.push({
      id: index,
      position,
      basePosition: [...position],
      weight: 0.45 + random() * 0.55,
      region: regionFor(x, y),
      phase: random() * Math.PI * 2
    });
  }
  return nodes;
}

export function generateAmbientParticles(count: number, seed = `${NEURAL_SEED}_AMBIENT`): AmbientParticle[] {
  const random = createSeededRandom(seed);
  const particles: AmbientParticle[] = [];
  for (let index = 0; index < count; index++) {
    const theta = Math.acos(1 - 2 * random());
    const phi = Math.PI * 2 * random();
    const radius = 1.55 + random() * 1.1;
    const sinTheta = Math.sin(theta);
    particles.push({
      position: [
        Math.cos(phi) * sinTheta * radius * 1.15,
        Math.cos(theta) * radius * 0.78,
        Math.sin(phi) * sinTheta * radius * 0.82
      ],
      phase: random() * Math.PI * 2,
      size: 0.55 + random() * 0.9
    });
  }
  return particles;
}
