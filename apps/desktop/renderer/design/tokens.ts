export const tokens = {
  colors: { bg0: "#070910", bg1: "#0D111B", surface: "#121827", border: "#263047", text: "#F5F7FF", muted: "#8E9AB2", violet: "#765CFF", cyan: "#49D6FF", green: "#3BD89F", amber: "#F5B74F", red: "#FF5D78" },
  radius: { small: 8, control: 12, card: 16, hero: 24 },
  motion: { fast: 140, standard: 220, context: 360 }
} as const;
export type AgentVisualState = "idle" | "interpreting" | "planning" | "executing-tool" | "awaiting-approval" | "responding" | "success" | "error" | "offline";
