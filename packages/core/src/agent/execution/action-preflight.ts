import type {RiskLevel} from "@nexo/shared";import type {PreparedAction} from "./types.js";
export function preparedAction(value:{executionId:string;toolName:string;input:Record<string,unknown>;fingerprint:string;idempotencyKey?:string;mutatesState:boolean;risk:RiskLevel;requiresApproval:boolean}):PreparedAction{return{...value,status:"PREPARED"};}
