import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BackgroundTask } from "@nexo/shared";

function nodesFor(task?: BackgroundTask): Node[] {
  const history = task?.statusHistory?.filter(Boolean) ?? [];
  const labels = history.length ? history.slice(-7) : ["Aguardando uma execução"];
  return labels.map((label, index) => ({
    id: `step-${index}`,
    position: { x: 30 + index * 178, y: index % 2 ? 118 : 34 },
    data: { label: index === labels.length - 1 && task?.status === "running" ? `● ${label}` : label },
    className: index === labels.length - 1 && task?.status === "running" ? "agentFlowNode active" : "agentFlowNode"
  }));
}

export function AgentFlowView({ task }: { task?: BackgroundTask }) {
  const nodes = nodesFor(task);
  const edges: Edge[] = nodes.slice(1).map((node, index) => ({ id: `edge-${index}`, source: nodes[index].id, target: node.id, animated: index === nodes.length - 2 && task?.status === "running", className: "agentFlowEdge" }));
  return <section className="agentFlow" aria-label="Fluxo de execução do agente"><header><small>FLUXO DE EXECUÇÃO</small><span>{task?.status === "running" ? "Em andamento" : task ? "Concluído" : "Aguardando"}</span></header><div className="agentFlowCanvas"><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.25 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag zoomOnScroll={false} zoomOnPinch={false} proOptions={{ hideAttribution: true }}><Background gap={18} size={1} /><MiniMap pannable zoomable /><Controls showInteractive={false} /></ReactFlow></div></section>;
}
