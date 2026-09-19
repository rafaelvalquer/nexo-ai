import type { NeuralEdge, NeuralNode } from "./types";
import { createSeededRandom, NEURAL_SEED } from "./neuralGeometry";

const CELL_SIZE = 0.56;
const MAX_DISTANCE = 0.62;
const MIN_CONNECTIONS = 3;

type Grid = Map<string, number[]>;

const cellKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

function buildSpatialGrid(nodes: NeuralNode[]) {
  const grid: Grid = new Map();
  for (const node of nodes) {
    const [x, y, z] = node.position;
    const key = cellKey(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE), Math.floor(z / CELL_SIZE));
    const bucket = grid.get(key);
    if (bucket) bucket.push(node.id);
    else grid.set(key, [node.id]);
  }
  return grid;
}

function candidatesFor(node: NeuralNode, grid: Grid) {
  const [x, y, z] = node.position;
  const cx = Math.floor(x / CELL_SIZE), cy = Math.floor(y / CELL_SIZE), cz = Math.floor(z / CELL_SIZE);
  const candidates: number[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const bucket = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
    if (bucket) candidates.push(...bucket);
  }
  return candidates;
}

function distanceSquared(a: NeuralNode, b: NeuralNode) {
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  return dx * dx + dy * dy + dz * dz;
}

export function generateNeuralEdges(nodes: NeuralNode[], maxConnections = 5, seed = `${NEURAL_SEED}_EDGES`) {
  if (nodes.length < 2) return [];
  const grid = buildSpatialGrid(nodes);
  const random = createSeededRandom(seed);
  const edges: NeuralEdge[] = [];
  const keys = new Set<string>();
  const degree = new Array(nodes.length).fill(0) as number[];
  const maxDistanceSquared = MAX_DISTANCE * MAX_DISTANCE;

  const connect = (source: number, target: number, longRange = false) => {
    if (source === target) return false;
    const a = Math.min(source, target), b = Math.max(source, target), key = `${a}:${b}`;
    if (keys.has(key) || degree[source] >= maxConnections || degree[target] >= maxConnections) return false;
    keys.add(key);
    degree[source]++;
    degree[target]++;
    edges.push({source, target, weight: longRange ? 0.38 : 0.55 + random() * 0.45, phase: random() * Math.PI * 2});
    return true;
  };

  for (const node of nodes) {
    const nearby = candidatesFor(node, grid)
      .filter(index => index !== node.id)
      .map(index => ({index, distance: distanceSquared(node, nodes[index])}))
      .filter(item => item.distance <= maxDistanceSquared)
      .sort((a, b) => a.distance - b.distance);

    for (const candidate of nearby) {
      if (degree[node.id] >= maxConnections) break;
      connect(node.id, candidate.index);
    }
  }

  for (const node of nodes) {
    if (degree[node.id] >= MIN_CONNECTIONS) continue;
    const nearest = nodes
      .filter(candidate => candidate.id !== node.id)
      .map(candidate => ({index: candidate.id, distance: distanceSquared(node, candidate)}))
      .sort((a, b) => a.distance - b.distance);
    for (const candidate of nearest) {
      if (degree[node.id] >= MIN_CONNECTIONS) break;
      connect(node.id, candidate.index);
    }
  }

  const longRangeTarget = Math.max(1, Math.floor(edges.length * 0.04));
  let attempts = longRangeTarget * 10;
  let added = 0;
  while (added < longRangeTarget && attempts-- > 0) {
    const source = Math.floor(random() * nodes.length);
    const target = Math.floor(random() * nodes.length);
    if (Math.abs(nodes[source].position[0] - nodes[target].position[0]) < 0.7) continue;
    if (connect(source, target, true)) added++;
  }

  return edges;
}

export function buildAdjacencyMap(edges: NeuralEdge[], nodeCount: number) {
  const adjacency = Array.from({length: nodeCount}, () => [] as number[]);
  edges.forEach((edge, index) => {
    adjacency[edge.source]?.push(index);
    adjacency[edge.target]?.push(index);
  });
  return adjacency;
}
