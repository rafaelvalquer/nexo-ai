import type { AgentVisualState } from "../../../design/tokens";

export const orbColors: Record<AgentVisualState, { core: string; glow: string; ring: string }> = {
  idle: { core: "#765cff", glow: "#765cff", ring: "#49d6ff" },
  interpreting: { core: "#9c7cff", glow: "#765cff", ring: "#a99bff" },
  planning: { core: "#a388ff", glow: "#8d70ff", ring: "#49d6ff" },
  "executing-tool": { core: "#49d6ff", glow: "#49d6ff", ring: "#8ee9ff" },
  "awaiting-approval": { core: "#f5b74f", glow: "#f5b74f", ring: "#ffe09a" },
  responding: { core: "#49d6ff", glow: "#49d6ff", ring: "#a99bff" },
  success: { core: "#3bd89f", glow: "#3bd89f", ring: "#8cfdca" },
  error: { core: "#ff5d78", glow: "#ff5d78", ring: "#ffadba" },
  offline: { core: "#ff5d78", glow: "#ff5d78", ring: "#ffadba" }
};
