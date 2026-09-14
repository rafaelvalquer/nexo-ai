import type { ChatActionRequest, ResourceItem } from "@nexo/shared";
import type { PlanStep } from "../../agent/planner.js";
import type { ResourceBinding } from "../presentation/types.js";

export type ActionContext = { request: ChatActionRequest; item: ResourceItem; items: ResourceItem[]; binding: ResourceBinding };
export type ActionPlan = { steps: PlanStep[]; preflight?: PlanStep; successText: string; mode?: "expand" | "list" | "preview"; mutation: boolean };
export type ActionHandler = (context: ActionContext) => ActionPlan;
export class ChatActionRegistry {
  private handlers = new Map<string, ActionHandler>();
  register(id: string, handler: ActionHandler) { this.handlers.set(id, handler); return this; }
  resolve(id: string) { const handler = this.handlers.get(id); if (!handler) throw new Error("Ação não registrada."); return handler; }
}
