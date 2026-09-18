export const motionTokens = {
  duration: { instant: 80, fast: 140, normal: 220, slow: 360, page: 180, shimmer: 1400, spin: 900, pulse: 1200, cursor: 850 },
  ease: {
    out: [0.16, 1, 0.3, 1] as const,
    inOut: [0.77, 0, 0.175, 1] as const
  },
  spring: {
    fast: { type: "spring" as const, stiffness: 520, damping: 38 },
    normal: { type: "spring" as const, stiffness: 380, damping: 32 },
    navigation: { type: "spring" as const, stiffness: 420, damping: 34 }
  },
  distance: { subtle: 4, panel: 24, content: 8, toast: 8 },
  scale: { pressed: 0.98, popover: 0.97 },
  blur: { toast: 4, backdrop: 8 }
} as const;

export type MotionTokens = typeof motionTokens;
