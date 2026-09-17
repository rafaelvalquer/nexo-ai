export const tokens = {
  colors: {
    background: "var(--nexo-bg)", backgroundRaised: "var(--nexo-bg-raised)",
    surface1: "var(--nexo-surface-1)", surface2: "var(--nexo-surface-2)", surface3: "var(--nexo-surface-3)",
    borderSubtle: "var(--nexo-border-subtle)", border: "var(--nexo-border)", borderStrong: "var(--nexo-border-strong)",
    text: "var(--nexo-text)", textSecondary: "var(--nexo-text-secondary)", textMuted: "var(--nexo-text-muted)",
    violet: "var(--nexo-violet)", cyan: "var(--nexo-cyan)", success: "var(--nexo-success)", warning: "var(--nexo-warning)", danger: "var(--nexo-danger)"
  },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
  radius: { small: 8, control: 12, card: 16, hero: 24 },
  shadow: { small: "var(--nexo-shadow-sm)", medium: "var(--nexo-shadow-md)", large: "var(--nexo-shadow-lg)", accent: "var(--nexo-glow-accent)" },
  motion: { instant: 80, fast: 140, standard: 220, context: 360 }
} as const;
export type AgentVisualState = "idle" | "interpreting" | "planning" | "executing-tool" | "awaiting-approval" | "responding" | "success" | "error" | "offline";
