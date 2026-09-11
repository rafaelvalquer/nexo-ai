import type { NexoDesktopApi } from "../../electron/preload/index.cjs";
declare global { interface Window { nexo: NexoDesktopApi; } }
export {};
