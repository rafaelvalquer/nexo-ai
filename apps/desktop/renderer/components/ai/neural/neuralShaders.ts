const sharedDeform = `
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uPointerSpeed;
uniform float uSpread;
uniform float uMotionSpeed;
uniform float uWave;
uniform float uActiveRegion;
uniform float uIdleWave;
uniform vec3 uIdleWaveOrigin;

vec3 deformPosition(vec3 source, float phase, float region) {
  vec3 p = source;
  float hemisphere = sign(source.x);
  float breath =
    sin(uTime * 0.62) * 0.020 +
    sin(uTime * 0.21) * 0.008;
  float asymmetricBreath =
    sin(uTime * 0.39 + hemisphere * 0.7) * 0.006;

  p *= 1.0 + breath + asymmetricBreath + uSpread * 0.12;

  float frequency =
    0.72 +
    fract(sin(phase * 43.17) * 43758.5453) * 1.65;
  float amplitude = 0.006 + 0.010 * uMotionSpeed;

  p.x += sin(uTime * frequency + phase) * amplitude;
  p.y += cos(uTime * frequency * 0.73 + phase * 1.4) * amplitude * 0.78;
  p.z += sin(uTime * frequency * 1.17 + phase * 2.1) * amplitude * 0.92;

  vec2 projected = vec2(p.x / 1.8, p.y / 1.25);
  vec2 delta = projected - uPointer;
  float distanceToPointer = length(delta);
  float field =
    smoothstep(0.62, 0.03, distanceToPointer) *
    uPointerStrength;
  vec2 direction =
    distanceToPointer > 0.001
      ? normalize(delta)
      : vec2(0.0);

  p.xy += direction * field * (0.10 + uPointerSpeed * 0.16);
  p.z += field * 0.07;

  float pointerWave =
    sin(distanceToPointer * 17.0 - uTime * 9.0) *
    uWave *
    smoothstep(0.85, 0.05, distanceToPointer);
  p.z += pointerWave * 0.045;

  float idleDistance = distance(p, uIdleWaveOrigin);
  float idleDisplacement =
    sin(idleDistance * 14.0 - uTime * 7.0) *
    uIdleWave *
    smoothstep(1.75, 0.04, idleDistance);
  p += normalize(p - uIdleWaveOrigin + vec3(0.0001)) * idleDisplacement * 0.006;

  if (uActiveRegion >= 0.0 && abs(region - uActiveRegion) < 0.25) {
    p *= 1.018;
  }

  return p;
}
`;

export const nodeVertexShader = `
attribute vec3 aPosition;
attribute float aPhase;
attribute float aWeight;
attribute float aRegion;
uniform mat4 uMvp;
uniform mat4 uModelView;
uniform float uDpr;
uniform float uNodeIntensity;
uniform float uTwinkleStrength;
uniform float uIdleEnergy;
uniform float uIdleBurst;
uniform float uIdleFocusRegion;
uniform float uIdleFocusIntensity;
uniform float uCascadeIntensity;
varying float vBrightness;
varying float vRegionBoost;
${sharedDeform}
void main() {
  vec3 p = deformPosition(aPosition, aPhase, aRegion);
  vec4 view = uModelView * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);

  float depthScale =
    clamp(4.2 / max(1.0, -view.z), 0.62, 1.55);

  float active =
    (uActiveRegion >= 0.0 && abs(aRegion - uActiveRegion) < 0.25)
      ? 1.0
      : 0.0;

  float focus =
    (uIdleFocusRegion >= 0.0 && abs(aRegion - uIdleFocusRegion) < 0.25)
      ? uIdleFocusIntensity
      : 0.0;

  float frequency =
    0.7 +
    fract(sin(aPhase * 43.17) * 43758.5453) * 2.1;

  float twinkleA =
    sin(uTime * frequency + aPhase * 5.1);
  float twinkleB =
    sin(uTime * 2.31 + aPhase * 9.7);
  float twinkle =
    clamp(0.5 + 0.5 * (twinkleA * 0.65 + twinkleB * 0.35), 0.0, 1.0);

  float tierSeed =
    fract(sin(aPhase * 91.13 + aWeight * 37.7) * 24634.6345);
  float tier = 0.35;
  if (tierSeed > 0.98) tier = 1.40;
  else if (tierSeed > 0.90) tier = 1.00;
  else if (tierSeed > 0.70) tier = 0.65;

  float sparkSeed =
    fract(sin(aPhase * 117.91 + aWeight * 13.7) * 17341.114);
  float sparkMask =
    smoothstep(0.80, 0.995, sparkSeed) * uIdleBurst;

  float idleDistance = distance(p, uIdleWaveOrigin);
  float idleWave =
    max(0.0, sin(idleDistance * 14.0 - uTime * 7.0)) *
    uIdleWave *
    smoothstep(1.8, 0.03, idleDistance);

  float cascade =
    max(0.0, sin(uTime * 4.6 + aPhase * 6.2)) *
    uCascadeIntensity *
    0.28;

  vRegionBoost = active + focus * 0.7;
  vBrightness = clamp(
    (0.5 + aWeight * 0.5) * uNodeIntensity * uIdleEnergy +
    active * 0.35 +
    focus * 0.52 +
    twinkle * uTwinkleStrength * tier +
    sparkMask * 0.65 +
    idleWave * 0.42 +
    cascade,
    0.0,
    1.65
  );

  gl_PointSize =
    (
      2.2 +
      aWeight * 2.8 +
      active * 1.8 +
      focus * 1.1 +
      idleWave * 1.2 +
      sparkMask * 0.9
    ) *
    depthScale *
    uDpr;
}`;

export const nodeFragmentShader = `
precision mediump float;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
varying float vBrightness;
varying float vRegionBoost;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float radius = length(uv) * 2.0;
  if (radius > 1.0) discard;
  float core = smoothstep(0.66, 0.0, radius);
  float halo = smoothstep(1.0, 0.15, radius) * 0.42;
  vec3 color =
    mix(uPrimary, uSecondary, clamp(0.35 + vRegionBoost * 0.35, 0.0, 0.85));
  gl_FragColor =
    vec4(color, (core + halo) * vBrightness);
}`;

export const edgeVertexShader = `
attribute vec3 aPosition;
attribute float aPhase;
attribute float aWeight;
attribute float aRegion;
uniform mat4 uMvp;
uniform float uConnectionIntensity;
uniform float uShimmerStrength;
uniform float uIdleEnergy;
uniform float uIdleFocusRegion;
uniform float uIdleFocusIntensity;
uniform float uCascadeIntensity;
varying float vAlpha;
${sharedDeform}
void main() {
  vec3 p = deformPosition(aPosition, aPhase, aRegion);
  gl_Position = uMvp * vec4(p, 1.0);

  float active =
    (uActiveRegion >= 0.0 && abs(aRegion - uActiveRegion) < 0.25)
      ? 0.22
      : 0.0;

  float focus =
    (uIdleFocusRegion >= 0.0 && abs(aRegion - uIdleFocusRegion) < 0.25)
      ? uIdleFocusIntensity * 0.34
      : 0.0;

  float shimmer =
    0.5 +
    0.5 *
    sin(uTime * 0.9 + aPhase * 4.7);

  float idleDistance = distance(p, uIdleWaveOrigin);
  float idleWave =
    max(0.0, sin(idleDistance * 14.0 - uTime * 7.0)) *
    uIdleWave *
    smoothstep(1.8, 0.03, idleDistance) *
    0.24;

  float cascade =
    max(0.0, sin(uTime * 3.8 + aPhase * 7.3)) *
    uCascadeIntensity *
    0.22;

  float shimmerGain =
    1.0 - uShimmerStrength * 0.28 +
    shimmer * uShimmerStrength * 0.52;

  vAlpha = clamp(
    (
      uConnectionIntensity * (0.38 + aWeight * 0.62) +
      active +
      focus +
      idleWave +
      cascade
    ) *
    shimmerGain *
    uIdleEnergy,
    0.0,
    0.88
  );
}`;

export const edgeFragmentShader = `
precision mediump float;
uniform vec3 uSecondary;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uSecondary, vAlpha);
}`;

export const pulseVertexShader = `
attribute vec3 aPosition;
attribute float aIntensity;
uniform mat4 uMvp;
uniform mat4 uModelView;
uniform float uDpr;
uniform float uSpread;
uniform float uIdleEnergy;
varying float vIntensity;
void main() {
  vec3 p = aPosition * (1.0 + uSpread * 0.12);
  vec4 view = uModelView * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);
  gl_PointSize =
    (4.0 + aIntensity * 3.2) *
    clamp(4.4 / max(1.0, -view.z), 0.7, 1.5) *
    uDpr;
  vIntensity = aIntensity * uIdleEnergy;
}`;

export const pulseFragmentShader = `
precision mediump float;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
varying float vIntensity;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  float alpha =
    pow(1.0 - radius, 1.7) *
    vIntensity;
  vec3 color =
    mix(uPrimary, uSecondary, 0.48);
  gl_FragColor = vec4(color, alpha);
}`;

export const ambientVertexShader = `
attribute vec3 aPosition;
attribute float aPhase;
attribute float aSize;
uniform mat4 uMvp;
uniform mat4 uModelView;
uniform float uTime;
uniform float uDpr;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uMotionSpeed;
uniform float uIdleEnergy;
uniform float uIdleBurst;
varying float vAlpha;
void main() {
  vec3 p = aPosition;
  float amplitude = 0.045 + 0.018 * uMotionSpeed;

  p.x +=
    sin(uTime * 0.11 + aPhase) *
    amplitude;
  p.y +=
    cos(uTime * 0.073 + aPhase * 1.7) *
    amplitude * 0.82;
  p.z +=
    sin(uTime * 0.091 + aPhase * 0.6) *
    0.12;

  p.x +=
    sin(p.y * 2.4 + uTime * 0.08 + aPhase) *
    0.015;

  p.xy +=
    uPointer *
    0.035 *
    uPointerStrength *
    (0.25 + 0.75 * abs(p.z) / 2.5);

  vec4 view = uModelView * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);

  gl_PointSize =
    aSize *
    (1.0 + uIdleBurst * 0.18) *
    clamp(4.0 / max(1.0, -view.z), 0.55, 1.3) *
    uDpr;

  vAlpha =
    (
      0.20 +
      0.24 *
      (0.5 + 0.5 * sin(aPhase + uTime * 0.32))
    ) *
    uIdleEnergy;
}`;

export const ambientFragmentShader = `
precision mediump float;
uniform vec3 uSecondary;
varying float vAlpha;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  gl_FragColor =
    vec4(uSecondary, (1.0 - radius) * vAlpha);
}`;
