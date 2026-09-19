import type { MutableRefObject } from "react";
import type { AgentVisualState } from "../../../design/tokens";

export type NeuralQuality = "low" | "balanced" | "high";

export type NeuralNode = {
  id: number;
  position: [number, number, number];
  basePosition: [number, number, number];
  weight: number;
  region: number;
  phase: number;
};

export type NeuralEdge = {
  source: number;
  target: number;
  weight: number;
  phase: number;
};

export type AmbientParticle = {
  position: [number, number, number];
  phase: number;
  size: number;
};

export type SynapticPulse = {
  edgeIndex: number;
  progress: number;
  speed: number;
  intensity: number;
  reverse: boolean;
};

export type NeuralInteraction = {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  velocityX: number;
  velocityY: number;
  speed: number;
  hovering: boolean;
  pressed: boolean;
  expanded: boolean;
  activeRegion: number;
  wave: number;
};

export type NeuralQualityProfile = {
  nodeCount: number;
  maxConnections: number;
  particleCount: number;
  maxPulses: number;
  dpr: number;
};

export type NeuralStateConfig = {
  pulseCount: number;
  pulseSpeed: number;
  nodeIntensity: number;
  connectionIntensity: number;
  motionSpeed: number;
  spread: number;
  interactionStrength: number;
  primary: string;
  secondary: string;
};

export type NeuralSceneProps = {
  state: AgentVisualState;
  interaction: MutableRefObject<NeuralInteraction>;
  paused: boolean;
  quality: NeuralQuality;
  onUnavailable: () => void;
  onQualityChange?: (quality: NeuralQuality) => void;
};
