import type { CSSProperties } from "react";
import { generateBrainTopology } from "./brainTopology";

const topology=generateBrainTopology("fallback");
const project=(position:readonly[number,number,number])=>({
  x:60+(position[0]/1.5)*50,
  y:36-(position[1]/.9)*28
});

export function NeuralFallback({animated=true,className=""}:{animated?:boolean;className?:string}) {
  return <div className={`neuralCoreFallback neuralFallback ${animated?"isAnimated":""} ${className}`.trim()} aria-hidden="true" data-topology-version="brain-v1">
    <svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">
      <g className="neuralFallbackEdges">
        {topology.edges.map((edge,index)=>{
          const a=project(topology.nodes[edge.source].position),b=project(topology.nodes[edge.target].position);
          return <line key={`${edge.source}-${edge.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{"--edge-delay":`${(index%13)*-.17}s`} as CSSProperties}/>;
        })}
      </g>
      <g className="neuralFallbackNodes">
        {topology.nodes.map((node,index)=>{
          const p=project(node.position);
          return <circle key={node.id} cx={p.x} cy={p.y} r={.48+node.weight*.48} style={{"--node-delay":`${-node.phase}s`} as CSSProperties}/>;
        })}
      </g>
      {animated&&<g className="neuralFallbackPulses">
        {topology.edges.filter((_,index)=>index%11===3).slice(0,8).map((edge,index)=>{
          const a=project(topology.nodes[edge.source].position),b=project(topology.nodes[edge.target].position);
          return <circle key={index} r=".88" style={{"--pulse-delay":`${index*-.38}s`} as CSSProperties}>
            <animateMotion dur={`${2.7+(index%3)*.4}s`} repeatCount="indefinite" begin={`${index*-.31}s`} path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}/>
          </circle>;
        })}
      </g>}
    </svg>
  </div>;
}
