import type { AgentReference } from "../loop/types.js";

export type GoalDeliverable = { id:string; description:string; path?:string; documentId?:string; required:boolean; status:"pending"|"validated"|"failed"; sha256?:string };
export type GoalResource = { id:string; kind:"input"; description:string; path?:string; documentId?:string; mimeType?:string };
export type GoalStepAttempt = { number:number; toolCallId:string; toolName:string; ok:boolean; at:string; errorCode?:string; observationFingerprint:string; references?:AgentReference[] };
export type GoalStepStatus = "pending"|"in_progress"|"completed"|"retryable_failed"|"terminal_failed";
export type GoalStep = { id:string;description:string;status:GoalStepStatus;requiredDomains?:string[];requiredCapabilities?:string[];dependsOn?:string[];attempts:GoalStepAttempt[];maxAttempts:number;evidence?:{toolCallId?:string;observationFingerprint?:string;references?:AgentReference[]} };
export type GoalState = { objective:string;status:"active"|"blocked"|"completed"|"cancelled";constraints:string[];resources:GoalResource[];deliverables:GoalDeliverable[];steps:GoalStep[] };
export type AgentArtifact = { id:string;kind:"file"|"document"|"browser_result";path?:string;documentId?:string;mimeType?:string;sha256?:string;createdByToolCallId?:string };
export type AgentTaskState = { goal:GoalState;currentStepId?:string;selectedToolNames:string[];artifacts:AgentArtifact[] };
export type AgentResourceContext = { documents:Array<{id:string;name:string;mimeType:string;path?:string}> };
