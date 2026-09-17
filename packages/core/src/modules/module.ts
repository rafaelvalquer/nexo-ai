export type ModuleStatus = "disabled" | "starting" | "ready" | "error";

export interface CoreModule {
  readonly id: string;
  readonly dependencies?: readonly string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type ModuleSnapshot = { id: string; status: ModuleStatus; error?: string };
