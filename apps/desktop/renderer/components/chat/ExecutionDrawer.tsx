import type { BackgroundTask } from "@nexo/shared";
import { ExecutionSummary } from "./ExecutionSummary";
import { AgentFlowView } from "../ai/flow/AgentFlowView";
import { NexoDrawer } from "../ui/NexoDrawer";

export function ExecutionDrawer({ task, elapsed, open, onClose }: { task?: BackgroundTask; elapsed: number; open: boolean; onClose: () => void }) {
  const history = task?.statusHistory?.length ? task.statusHistory : [task?.statusMessage ?? "Nenhuma execução ativa."];
  return <NexoDrawer open={open} onClose={onClose} eyebrow="ASSISTENTE LOCAL" title="Etapas" className="executionDrawer">
    <AgentFlowView task={task} />
    <ExecutionSummary history={history} elapsed={elapsed} status={task?.status ?? "idle"} />
  </NexoDrawer>;
}
