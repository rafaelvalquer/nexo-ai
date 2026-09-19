import { getIdleEnergy } from "./neuralPhysics";

export type IdleEventType = "spark" | "cluster" | "cascade" | "wave" | "breath" | "shimmer";

export type IdleLifeState = {
  activity: number;
  focusRegion: number;
  focusIntensity: number;
  burst: number;
  shimmer: number;
  wave: number;
  waveOrigin: [number, number, number];
  cascade: number;
  rotationBiasX: number;
  rotationBiasY: number;
  rotationBiasZ: number;
  lastEvent: IdleEventType | null;
};

const REGION_ORIGINS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.62, 0.42, 0.05],
  [0.62, 0.42, -0.04],
  [-0.68, 0.02, 0.08],
  [0.68, 0.02, -0.06],
  [-0.58, -0.42, -0.02],
  [0.58, -0.42, 0.06]
];

const between = (random: () => number, min: number, max: number) => min + random() * (max - min);

export function createIdleLife(random: () => number) {
  const state: IdleLifeState = {
    activity: 0.92,
    focusRegion: -1,
    focusIntensity: 0,
    burst: 0,
    shimmer: 0,
    wave: 0,
    waveOrigin: [0, 0, 0],
    cascade: 0,
    rotationBiasX: 0,
    rotationBiasY: 0,
    rotationBiasZ: 0,
    lastEvent: null
  };

  let nextSpark = 0;
  let nextCluster = 0;
  let nextWave = 0;
  let enabledLastFrame = false;

  const scheduleFrom = (time: number) => {
    nextSpark = time + between(random, 0.7, 1.7);
    nextCluster = time + between(random, 3, 7);
    nextWave = time + between(random, 8, 16);
  };

  const chooseRegion = () => Math.min(5, Math.floor(random() * 6));

  const focus = (region: number, strength: number) => {
    state.focusRegion = region;
    state.focusIntensity = Math.max(state.focusIntensity, strength);
  };

  const update = (time: number, delta: number, enabled: boolean, intensity = 1) => {
    if (enabled && !enabledLastFrame) scheduleFrom(time);
    enabledLastFrame = enabled;

    state.activity = getIdleEnergy(time);
    state.burst *= Math.exp(-delta * 3.2);
    state.shimmer *= Math.exp(-delta * 2.1);
    state.wave *= Math.exp(-delta * 0.88);
    state.cascade *= Math.exp(-delta * 1.55);
    state.focusIntensity *= Math.exp(-delta * 1.45);
    state.rotationBiasX *= Math.exp(-delta * 0.62);
    state.rotationBiasY *= Math.exp(-delta * 0.62);
    state.rotationBiasZ *= Math.exp(-delta * 0.62);
    if (state.focusIntensity < 0.018) state.focusRegion = -1;

    if (!enabled) return state;

    if (time >= nextSpark) {
      const roll = random();
      state.burst = Math.max(state.burst, between(random, 0.20, 0.48) * intensity);
      state.shimmer = Math.max(state.shimmer, between(random, 0.18, 0.42) * intensity);
      if (roll < 0.18) {
        state.lastEvent = "cascade";
        state.cascade = Math.max(state.cascade, between(random, 0.42, 0.72) * intensity);
        focus(chooseRegion(), between(random, 0.16, 0.28) * intensity);
      } else if (roll < 0.46) {
        state.lastEvent = "spark";
        focus(chooseRegion(), between(random, 0.10, 0.22) * intensity);
      } else {
        state.lastEvent = "shimmer";
      }
      nextSpark = time + between(random, 0.7, 1.7);
    }

    if (time >= nextCluster) {
      const region = chooseRegion();
      state.lastEvent = random() < 0.14 ? "cascade" : "cluster";
      focus(region, between(random, 0.28, 0.48) * intensity);
      state.burst = Math.max(state.burst, between(random, 0.28, 0.52) * intensity);
      state.shimmer = Math.max(state.shimmer, between(random, 0.22, 0.45) * intensity);
      if (state.lastEvent === "cascade") state.cascade = Math.max(state.cascade, between(random, 0.55, 0.85) * intensity);
      state.rotationBiasX = (random() - 0.5) * 0.032 * intensity;
      state.rotationBiasY = (random() - 0.5) * 0.045 * intensity;
      state.rotationBiasZ = (random() - 0.5) * 0.018 * intensity;
      nextCluster = time + between(random, 3, 7);
    }

    if (time >= nextWave) {
      const region = chooseRegion();
      const origin = REGION_ORIGINS[region];
      state.lastEvent = "wave";
      state.wave = between(random, 0.62, 0.95) * intensity;
      state.waveOrigin[0] = origin[0];
      state.waveOrigin[1] = origin[1];
      state.waveOrigin[2] = origin[2];
      focus(region, between(random, 0.22, 0.38) * intensity);
      state.burst = Math.max(state.burst, between(random, 0.30, 0.46) * intensity);
      nextWave = time + between(random, 8, 16);
    }

    return state;
  };

  return {state, update};
}
