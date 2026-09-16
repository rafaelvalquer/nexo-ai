import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { AgentTaskState } from "./goal-types.js";

export class CompletionValidator {
  async validate(task:AgentTaskState):Promise<{complete:boolean;reason?:string;taskState:AgentTaskState}>{
    const next=structuredClone(task);
    for(const deliverable of next.goal.deliverables.filter(item=>item.required&&item.path)){
      try{const artifact=next.artifacts.find(item=>matches(item.path,deliverable.path));if(!artifact?.path||!artifact.createdByToolCallId)throw new Error("artifact missing");const bytes=await fs.readFile(artifact.path);const hash=createHash("sha256").update(bytes).digest("hex");if(artifact.sha256!==hash)throw new Error("evidence mismatch");deliverable.status="validated";deliverable.sha256=hash;const validationStep=next.goal.steps.find(step=>/Validar o artefato físico/i.test(step.description));if(validationStep){validationStep.status="completed";validationStep.evidence={toolCallId:artifact.createdByToolCallId,references:[{kind:"path",value:artifact.path}]};}}catch{deliverable.status="failed";next.goal.status="active";return{complete:false,reason:`O entregável ainda não foi validado: ${deliverable.path}`,taskState:next};}
    }
    const terminal=next.goal.steps.filter(step=>step.status==="terminal_failed");
    if(terminal.length){next.goal.status="blocked";return{complete:false,reason:`${terminal.length} etapa(s) falharam de forma terminal.`,taskState:next};}
    const pending=next.goal.steps.filter(step=>step.status!=="completed");
    if(pending.length){next.goal.status="active";return{complete:false,reason:`Ainda há ${pending.length} etapa(s) sem evidência de conclusão.`,taskState:next};}
    next.goal.status="completed";return{complete:true,taskState:next};
  }
}
function matches(artifact?:string,deliverable?:string){if(!artifact||!deliverable)return false;const left=artifact.toLowerCase(),right=deliverable.toLowerCase();return left===right||(!right.includes("\\")&&!right.includes("/")&&(left.endsWith(`\\${right}`)||left.endsWith(`/${right}`)));}
