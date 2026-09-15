// Pixel Office has one canonical PixiJS entry point. Keeping every scene
// module behind this boundary prevents a lazy chunk or dev reload from
// evaluating different Pixi entry points against the same extension registry.
import * as pixi from "pixi.js";

let runtimePromise: Promise<typeof pixi> | undefined;

export function loadPixiRuntime() {
  return runtimePromise ??= Promise.resolve(pixi);
}

export * from "pixi.js";
