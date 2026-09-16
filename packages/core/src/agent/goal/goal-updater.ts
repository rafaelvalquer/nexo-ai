import { randomUUID } from "node:crypto";
import type { AgentObservation } from "../loop/types.js";
import { observationFingerprint } from "../loop/loop-guard.js";
import type { AgentArtifact, AgentTaskState } from "./goal-types.js";

export class GoalUpdater {
  update(task:AgentTaskState,observation:AgentObservation):AgentTaskState{
    const next=structuredClone(task),domain=domainFor(observation.toolName);
    const steps=next.goal.steps.filter(item=>item.status==="pending"&&stepMatches(item.description,observation.toolName));
    for(const step of steps){step.status=observation.ok?"completed":"failed";step.evidence={toolCallId:observation.toolCallId,observationFingerprint:observationFingerprint(observation),references:observation.references};}
    if(observation.ok){const artifact=artifactFrom(observation);if(artifact&&!next.artifacts.some(item=>item.path===artifact.path&&item.sha256===artifact.sha256))next.artifacts.push(artifact);}
    for(const deliverable of next.goal.deliverables){const artifact=next.artifacts.find(item=>samePath(item.path,deliverable.path));if(artifact?.sha256){deliverable.status="validated";deliverable.sha256=artifact.sha256;}}
    const available=next.goal.steps.find(item=>item.status==="pending"&&(!item.dependsOn?.length||item.dependsOn.every(id=>next.goal.steps.some(candidate=>candidate.id===id&&candidate.status==="completed"))));
    next.currentStepId=available?.id;
    if(!observation.ok&&steps.length)next.goal.status="blocked";
    void domain;
    return next;
  }
}

function artifactFrom(observation:AgentObservation):AgentArtifact|undefined{const data=observation.data&&typeof observation.data==="object"?observation.data as Record<string,unknown>:undefined;const nested=data?.data&&typeof data.data==="object"?data.data as Record<string,unknown>:data;const target=typeof nested?.path==="string"?nested.path:undefined;const sha256=typeof nested?.sha256==="string"?nested.sha256:undefined;if(target&&sha256)return{id:randomUUID(),kind:/document_/.test(observation.toolName)?"document":"file",path:target,sha256,createdByToolCallId:observation.toolCallId};if(observation.toolName.startsWith("browser_")&&observation.references?.some(ref=>ref.kind==="url"))return{id:randomUUID(),kind:"browser_result",createdByToolCallId:observation.toolCallId};return undefined;}
function samePath(left?:string,right?:string){if(!left||!right)return false;return left.toLowerCase()===right.toLowerCase()||(!/[\\/]/.test(right)&&left.toLowerCase().endsWith(`\\${right.toLowerCase()}`)||left.toLowerCase().endsWith(`/${right.toLowerCase()}`));}
function domainFor(tool:string){return tool.startsWith("document_")?"document":tool.startsWith("browser_")?"browser":/file|folder/.test(tool)?"filesystem":tool.split("_")[0];}
function stepMatches(description:string,tool:string){if(/Localizar/i.test(description))return /search|list|find/.test(tool);if(/Analisar/i.test(description))return tool.startsWith("document_");if(/resumo/i.test(description))return /summarize|transform/.test(tool);if(/Criar/i.test(description))return /create_text_file|write_text_file|document_create|document_transform/.test(tool);if(/Abrir/i.test(description))return /open/.test(tool);return false;}
