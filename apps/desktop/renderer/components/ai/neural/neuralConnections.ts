import type { NeuralEdge, NeuralNode } from "./types";
import { createSeededRandom, NEURAL_SEED } from "./neuralGeometry";
import { segmentInsideBrain } from "./brainOutline";

const LOCAL_MAX_DISTANCE=.52;
const LONG_RANGE_MAX_DISTANCE=1.25;
const MIN_CONNECTIONS=2;

function distanceSquared(a:NeuralNode,b:NeuralNode){
  const dx=a.position[0]-b.position[0],dy=a.position[1]-b.position[1],dz=(a.position[2]-b.position[2])*.35;
  return dx*dx+dy*dy+dz*dz;
}
function segmentValid(a:NeuralNode,b:NeuralNode){
  return segmentInsideBrain([a.position[0],a.position[1]],[b.position[0],b.position[1]]);
}

export function generateNeuralEdges(nodes:NeuralNode[],maxConnections=5,seed=`${NEURAL_SEED}_EDGES`){
  if(nodes.length<2)return[];
  const random=createSeededRandom(seed),edges:NeuralEdge[]=[];
  const keys=new Set<string>(),degree=new Array(nodes.length).fill(0) as number[];
  const connect=(source:number,target:number,longRange=false)=>{
    if(source===target||degree[source]>=maxConnections||degree[target]>=maxConnections)return false;
    const a=Math.min(source,target),b=Math.max(source,target),key=`${a}:${b}`;
    if(keys.has(key)||!segmentValid(nodes[source],nodes[target]))return false;
    keys.add(key);degree[source]++;degree[target]++;
    const distance=Math.sqrt(distanceSquared(nodes[source],nodes[target]));
    const weight=longRange?.34+.16*random():Math.max(.46,.92-distance*.72)+random()*.08;
    edges.push({source,target,weight,phase:random()*Math.PI*2});
    return true;
  };

  for(const node of nodes){
    const candidates=nodes
      .filter(other=>other.id!==node.id)
      .map(other=>({id:other.id,distance:Math.sqrt(distanceSquared(node,other))}))
      .filter(item=>item.distance<=LOCAL_MAX_DISTANCE)
      .sort((a,b)=>a.distance-b.distance);
    for(const candidate of candidates){
      if(degree[node.id]>=MIN_CONNECTIONS)break;
      connect(node.id,candidate.id);
    }
  }

  let components=findComponents(nodes.length,edges);
  let safety=nodes.length*4;
  while(components.length>1&&safety-->0){
    let best:{a:number;b:number;distance:number}|undefined;
    for(let first=0;first<components.length;first++)for(let second=first+1;second<components.length;second++){
      for(const a of components[first])for(const b of components[second]){
        if(degree[a]>=maxConnections||degree[b]>=maxConnections||!segmentValid(nodes[a],nodes[b]))continue;
        const distance=Math.sqrt(distanceSquared(nodes[a],nodes[b]));
        if(distance>LONG_RANGE_MAX_DISTANCE)continue;
        if(!best||distance<best.distance)best={a,b,distance};
      }
    }
    if(!best)break;
    connect(best.a,best.b,best.distance>LOCAL_MAX_DISTANCE);
    components=findComponents(nodes.length,edges);
  }

  for(const node of nodes){
    const targetDegree=Math.min(maxConnections,MIN_CONNECTIONS+Math.floor(random()*Math.max(1,maxConnections-MIN_CONNECTIONS+1)));
    const candidates=nodes
      .filter(other=>other.id!==node.id)
      .map(other=>({id:other.id,distance:Math.sqrt(distanceSquared(node,other))}))
      .filter(item=>item.distance<=LOCAL_MAX_DISTANCE)
      .sort((a,b)=>a.distance-b.distance);
    for(const candidate of candidates){
      if(degree[node.id]>=targetDegree)break;
      connect(node.id,candidate.id);
    }
  }

  const longRangeTarget=Math.max(1,Math.floor(edges.length*.025));
  let attempts=longRangeTarget*30,added=0;
  while(added<longRangeTarget&&attempts-->0){
    const source=Math.floor(random()*nodes.length),target=Math.floor(random()*nodes.length);
    const distance=Math.sqrt(distanceSquared(nodes[source],nodes[target]));
    if(distance<LOCAL_MAX_DISTANCE*.9||distance>LONG_RANGE_MAX_DISTANCE)continue;
    if(connect(source,target,true))added++;
  }
  return edges;
}

function findComponents(nodeCount:number,edges:NeuralEdge[]){
  const adjacency=Array.from({length:nodeCount},()=>[] as number[]);
  for(const edge of edges){adjacency[edge.source].push(edge.target);adjacency[edge.target].push(edge.source);}
  const seen=new Set<number>(),components:number[][]=[];
  for(let start=0;start<nodeCount;start++){
    if(seen.has(start))continue;
    const component:number[]=[],queue=[start];seen.add(start);
    while(queue.length){
      const node=queue.shift()!;component.push(node);
      for(const next of adjacency[node])if(!seen.has(next)){seen.add(next);queue.push(next);}
    }
    components.push(component);
  }
  return components;
}

export function buildAdjacencyMap(edges:NeuralEdge[],nodeCount:number){
  const adjacency=Array.from({length:nodeCount},()=>[] as number[]);
  edges.forEach((edge,index)=>{adjacency[edge.source]?.push(index);adjacency[edge.target]?.push(index);});
  return adjacency;
}
