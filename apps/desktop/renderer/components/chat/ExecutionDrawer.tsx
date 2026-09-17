import type { BackgroundTask } from "@nexo/shared";
import { X } from "lucide-react";
import { ExecutionSummary } from "./ExecutionSummary";
import { AgentFlowView } from "../ai/flow/AgentFlowView";

export function ExecutionDrawer({task,elapsed,open,onClose}:{task?:BackgroundTask;elapsed:number;open:boolean;onClose:()=>void}){
  if(!open)return null;
  const history=task?.statusHistory?.length?task.statusHistory:[task?.statusMessage??"Nenhuma execução ativa."];
  return <div className="drawerBackdrop" onMouseDown={onClose}><aside className="executionDrawer" onMouseDown={event=>event.stopPropagation()} aria-label="Detalhes da execução"><header><div><small>ASSISTENTE LOCAL</small><h2>Etapas</h2></div><button onClick={onClose} aria-label="Fechar"><X size={18}/></button></header><AgentFlowView task={task}/><ExecutionSummary history={history} elapsed={elapsed}/></aside></div>;
}
