import type { AgentGraphState } from "../graph-state.js";
export function bootstrapNode(state: AgentGraphState) { return state.runId?.trim()?{ stage: "BOOTSTRAP" as const, runId: state.runId,error:undefined }:{stage:"BOOTSTRAP" as const,error:"runId é obrigatório."}; }
