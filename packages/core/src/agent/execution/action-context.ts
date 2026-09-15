import type { ActionExecutionContext } from "./types.js";
export type ActionContext=ActionExecutionContext;
export function actionContext(value:ActionExecutionContext={}):ActionContext{return value;}
