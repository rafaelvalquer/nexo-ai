import type { CSSProperties } from "react";

const FALLBACK_NODES = Array.from({length: 44}, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const local = Math.floor(index / 2);
  const angle = local * 2.399963;
  const radius = 18 + (local % 8) * 3.6;
  return {
    x: 50 + side * 12 + Math.cos(angle) * radius * .72,
    y: 50 + Math.sin(angle) * radius * .58,
    phase: (index % 9) * .14
  };
});

const FALLBACK_EDGES = FALLBACK_NODES.flatMap((_, index) => {
  const targets = [index + 2, index + 6, index + (index % 4 === 0 ? 9 : 4)];
  return targets.filter(target => target < FALLBACK_NODES.length).map(target => [index, target] as const);
});

export function NeuralFallback({animated = true}: {animated?: boolean}) {
  return <div className={`neuralCoreFallback neuralFallback ${animated ? "isAnimated" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <g className="neuralFallbackEdges">
        {FALLBACK_EDGES.map(([source,target],index) => {
          const a=FALLBACK_NODES[source],b=FALLBACK_NODES[target];
          return <line key={`${source}-${target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{"--edge-delay":`${(index%13)*-.17}s`} as CSSProperties}/>;
        })}
      </g>
      <g className="neuralFallbackNodes">
        {FALLBACK_NODES.map((node,index)=><circle key={index} cx={node.x} cy={node.y} r={index%7===0?1.15:.72} style={{"--node-delay":`${-node.phase}s`} as CSSProperties}/>)}
      </g>
      {animated&&<g className="neuralFallbackPulses">
        {FALLBACK_EDGES.slice(4,10).map(([source,target],index)=>{
          const a=FALLBACK_NODES[source],b=FALLBACK_NODES[target];
          return <circle key={index} r="1.1" style={{"--pulse-delay":`${index*-.38}s`} as CSSProperties}>
            <animateMotion dur={`${2.4+(index%3)*.35}s`} repeatCount="indefinite" begin={`${index*-.31}s`} path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}/>
          </circle>;
        })}
      </g>}
    </svg>
  </div>;
}
