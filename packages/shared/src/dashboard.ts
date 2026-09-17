export type GadgetSize = "S" | "M" | "L" | "XL";
export type GadgetProvider = "internal" | "http" | "mcp";
export type GadgetCategory = "nexo" | "productivity" | "system" | "finance" | "weather" | "news" | "information";
export type DashboardGadgetId = "ai-status" | "tasks" | "approvals" | "automations" | "activity" | "documents" | "system" | "weather" | "currency" | "holidays" | "business-days" | "tech-news" | "earthquakes";
export type GadgetDefinition = { id: DashboardGadgetId; title: string; description: string; category: GadgetCategory; sizes: GadgetSize[]; defaultSize: GadgetSize; provider: GadgetProvider; refreshInterval?: number; requiresInternet?: boolean; requiresConfiguration?: boolean; attribution?: string };
export type DashboardGadgetInstance = { instanceId: string; gadgetId: DashboardGadgetId; size: GadgetSize; configuration: Record<string, unknown>; enabled: boolean };
export type DashboardSnapshot = { gadgets: DashboardGadgetInstance[]; updatedAt: string };
