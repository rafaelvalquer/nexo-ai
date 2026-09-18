import type { NexoDesktopApi } from "../../electron/preload/index.cjs";
declare global { interface Window { nexo: NexoDesktopApi; } const __NEXO_BUILD_INFO__: { version:string; commit:string; buildDate:string }; }
export {};
