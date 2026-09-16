import type { AgentReference } from "../loop/types.js";

export type GoalDeliverable = { id:string; description:string; path?:string; documentId?:string; required:boolean; status:"pending"|"validated"|"failed"; sha256?:string };
export type GoalStep = { id:string;description:string;status:"pending"|"in_progress"|"completed"|"failed"|"blocked";requiredDomains?:string[];requiredCapabilities?:string[];dependsOn?:string[];evidence?:{toolCallId?:string;observationFingerprint?:string;references?:AgentReference[]} };
export type GoalState = { objective:string;status:"active"|"blocked"|"completed"|"cancelled";constraints:string[];deliverables:GoalDeliverable[];steps:GoalStep[] };
export type AgentArtifact = { id:string;kind:"file"|"document"|"browser_result";path?:string;documentId?:string;mimeType?:string;sha256?:string;createdByToolCallId?:string };
export type AgentTaskState = { goal:GoalState;currentStepId?:string;selectedToolNames:string[];artifacts:AgentArtifact[] };
export type AgentResourceContext = { documents:Array<{id:string;name:string;mimeType:string}> };
