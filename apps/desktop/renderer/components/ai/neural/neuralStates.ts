import type { AgentVisualState } from "../../../design/tokens";
import type { NeuralStateConfig } from "./types";

export const neuralStates: Record<AgentVisualState, NeuralStateConfig> = {
  idle: {pulseCount: 10, pulseSpeed: 0.46, nodeIntensity: 0.62, connectionIntensity: 0.22, motionSpeed: 0.58, spread: 0.008, interactionStrength: 0.72, twinkleStrength: 0.32, shimmerStrength: 0.20, autonomousRotation: 1, spontaneousActivity: 0.65, primary: "#765cff", secondary: "#49d6ff"},
  interpreting: {pulseCount: 14, pulseSpeed: 0.72, nodeIntensity: 0.72, connectionIntensity: 0.28, motionSpeed: 0.75, spread: 0.015, interactionStrength: 0.82, twinkleStrength: 0.25, shimmerStrength: 0.22, autonomousRotation: 0.45, spontaneousActivity: 0.08, primary: "#9c7cff", secondary: "#a99bff"},
  planning: {pulseCount: 18, pulseSpeed: 0.84, nodeIntensity: 0.78, connectionIntensity: 0.34, motionSpeed: 0.92, spread: 0.025, interactionStrength: 0.88, twinkleStrength: 0.22, shimmerStrength: 0.24, autonomousRotation: 0.35, spontaneousActivity: 0.10, primary: "#a388ff", secondary: "#49d6ff"},
  "executing-tool": {pulseCount: 28, pulseSpeed: 1.22, nodeIntensity: 0.94, connectionIntensity: 0.46, motionSpeed: 1.25, spread: 0.05, interactionStrength: 1, twinkleStrength: 0.18, shimmerStrength: 0.30, autonomousRotation: 0.18, spontaneousActivity: 0.04, primary: "#49d6ff", secondary: "#8ee9ff"},
  "awaiting-approval": {pulseCount: 8, pulseSpeed: 0.42, nodeIntensity: 0.72, connectionIntensity: 0.24, motionSpeed: 0.45, spread: 0.012, interactionStrength: 0.78, twinkleStrength: 0.20, shimmerStrength: 0.16, autonomousRotation: 0.50, spontaneousActivity: 0.08, primary: "#f5b74f", secondary: "#ffe09a"},
  responding: {pulseCount: 22, pulseSpeed: 1.02, nodeIntensity: 0.88, connectionIntensity: 0.40, motionSpeed: 1.05, spread: 0.04, interactionStrength: 0.95, twinkleStrength: 0.20, shimmerStrength: 0.25, autonomousRotation: 0.25, spontaneousActivity: 0.04, primary: "#49d6ff", secondary: "#a99bff"},
  success: {pulseCount: 30, pulseSpeed: 1.30, nodeIntensity: 1, connectionIntensity: 0.52, motionSpeed: 1.12, spread: 0.07, interactionStrength: 0.9, twinkleStrength: 0.28, shimmerStrength: 0.32, autonomousRotation: 0.20, spontaneousActivity: 0.18, primary: "#3bd89f", secondary: "#8cfdca"},
  error: {pulseCount: 16, pulseSpeed: 0.96, nodeIntensity: 0.82, connectionIntensity: 0.32, motionSpeed: 0.88, spread: 0.03, interactionStrength: 0.86, twinkleStrength: 0.18, shimmerStrength: 0.28, autonomousRotation: 0.12, spontaneousActivity: 0.04, primary: "#ff5d78", secondary: "#ffadba"},
  offline: {pulseCount: 2, pulseSpeed: 0.20, nodeIntensity: 0.32, connectionIntensity: 0.09, motionSpeed: 0.16, spread: 0, interactionStrength: 0.28, twinkleStrength: 0.08, shimmerStrength: 0.06, autonomousRotation: 0.25, spontaneousActivity: 0.02, primary: "#ff5d78", secondary: "#ffadba"}
};

export const neuralColors = Object.fromEntries(
  Object.entries(neuralStates).map(([key, value]) => [key, {core: value.primary, glow: value.primary, ring: value.secondary}])
) as Record<AgentVisualState, {core: string; glow: string; ring: string}>;
