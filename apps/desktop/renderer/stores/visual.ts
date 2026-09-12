import { create } from "zustand";
import type { AgentVisualState } from "../design/tokens";
type VisualStore = { state: AgentVisualState; label: string; set: (state:AgentVisualState,label?:string)=>void };
export const useVisualStore=create<VisualStore>(set=>({state:"idle",label:"Pronto para ajudar",set:(state,label)=>set({state,label:label ?? ({idle:"Pronto para ajudar",interpreting:"Entendendo pedido",planning:"Montando plano operacional","executing-tool":"Executando ferramenta","awaiting-approval":"Esperando aprovação",responding:"Gerando resposta",success:"Tarefa concluída",error:"Ação precisa de atenção",offline:"IA local indisponível"}[state])})}));
