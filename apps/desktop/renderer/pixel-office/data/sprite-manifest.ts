export type OctopusAnimation =
  "idle" | "walkUp" | "walkDown" | "walkLeft" | "walkRight" |
  "working" | "thinking" | "planning" | "reading" | "mailing" | "browsing" | "system" |
  "approval" | "responding" | "success" | "error" | "cancelled" | "offline";

// Columns are coherent directions; rows are permanent identities, never frames.
export const OCTOPUS_SPRITE = {
  frameSize: 256,
  animationColumn: {
    idle: 0, walkDown: 0, walkLeft: 1, walkRight: 2, walkUp: 3,
    working: 3, thinking: 3, planning: 3, reading: 3, mailing: 3,
    browsing: 3, system: 3, approval: 3, responding: 3,
    success: 0, error: 0, cancelled: 0, offline: 0
  } satisfies Record<OctopusAnimation, number>
};

