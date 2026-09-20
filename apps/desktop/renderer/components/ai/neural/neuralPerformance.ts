import type { AgentVisualState } from "../../../design/tokens";
import type { NeuralQuality, NeuralQualityProfile } from "./types";

export const neuralQualityProfiles: Record<NeuralQuality, NeuralQualityProfile> = {
  low: {nodeCount: 220, maxConnections: 4, particleCount: 28, maxPulses: 12, dpr: 1},
  balanced: {nodeCount: 320, maxConnections: 5, particleCount: 42, maxPulses: 22, dpr: 1.25},
  high: {nodeCount: 420, maxConnections: 5, particleCount: 58, maxPulses: 30, dpr: 1.5}
};

export function initialNeuralQuality(width = 1000, hardwareConcurrency = 8): NeuralQuality {
  if (width < 760 || hardwareConcurrency <= 4) return "low";
  return "balanced";
}

export function lowerNeuralQuality(quality: NeuralQuality): NeuralQuality {
  return quality === "high" ? "balanced" : quality === "balanced" ? "low" : "low";
}

export function getTargetFrameInterval(state: AgentVisualState, hovering: boolean, visible: boolean) {
  if (!visible) return Number.POSITIVE_INFINITY;
  if (hovering) return 1000 / 60;
  if (state === "idle" || state === "offline") return 1000 / 30;
  return 1000 / 60;
}

export function shouldRenderNeuralScene(webglReady: boolean, reducedMotion: boolean, visible: boolean) {
  return webglReady && !reducedMotion && visible;
}
