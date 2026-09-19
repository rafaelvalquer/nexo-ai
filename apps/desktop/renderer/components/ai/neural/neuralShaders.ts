const sharedDeform = `
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uPointerSpeed;
uniform float uSpread;
uniform float uMotionSpeed;
uniform float uWave;
uniform float uActiveRegion;

vec3 deformPosition(vec3 source, float phase, float region) {
  vec3 p = source;
  float breath = sin(uTime * 0.7) * 0.015;
  p *= 1.0 + breath + uSpread * 0.12;
  float micro = sin(uTime * (0.6 + uMotionSpeed * 0.35) + phase * 2.7) * (0.008 + 0.008 * uMotionSpeed);
  p += normalize(source + vec3(0.0001)) * micro;

  vec2 projected = vec2(p.x / 1.8, p.y / 1.25);
  vec2 delta = projected - uPointer;
  float distanceToPointer = length(delta);
  float field = smoothstep(0.62, 0.03, distanceToPointer) * uPointerStrength;
  vec2 direction = distanceToPointer > 0.001 ? normalize(delta) : vec2(0.0);
  p.xy += direction * field * (0.10 + uPointerSpeed * 0.16);
  p.z += field * 0.07;

  float wave = sin(distanceToPointer * 17.0 - uTime * 9.0) * uWave * smoothstep(0.85, 0.05, distanceToPointer);
  p.z += wave * 0.045;
  if (uActiveRegion >= 0.0 && abs(region - uActiveRegion) < 0.25) p *= 1.018;
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
varying float vBrightness;
varying float vRegionBoost;
${sharedDeform}
void main() {
  vec3 p = deformPosition(aPosition, aPhase, aRegion);
  vec4 view = uModelView * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);
  float depthScale = clamp(4.2 / max(1.0, -view.z), 0.62, 1.55);
  float active = (uActiveRegion >= 0.0 && abs(aRegion - uActiveRegion) < 0.25) ? 1.0 : 0.0;
  vRegionBoost = active;
  vBrightness = clamp((0.5 + aWeight * 0.5) * uNodeIntensity + active * 0.35, 0.0, 1.35);
  gl_PointSize = (2.2 + aWeight * 2.8 + active * 1.8) * depthScale * uDpr;
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
  vec3 color = mix(uPrimary, uSecondary, 0.35 + vRegionBoost * 0.35);
  gl_FragColor = vec4(color, (core + halo) * vBrightness);
}`;

export const edgeVertexShader = `
attribute vec3 aPosition;
attribute float aPhase;
attribute float aWeight;
attribute float aRegion;
uniform mat4 uMvp;
uniform float uConnectionIntensity;
varying float vAlpha;
${sharedDeform}
void main() {
  vec3 p = deformPosition(aPosition, aPhase, aRegion);
  gl_Position = uMvp * vec4(p, 1.0);
  float active = (uActiveRegion >= 0.0 && abs(aRegion - uActiveRegion) < 0.25) ? 0.22 : 0.0;
  vAlpha = clamp(uConnectionIntensity * (0.38 + aWeight * 0.62) + active, 0.0, 0.78);
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
varying float vIntensity;
void main() {
  vec3 p = aPosition * (1.0 + uSpread * 0.12);
  vec4 view = uModelView * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);
  gl_PointSize = (4.0 + aIntensity * 3.2) * clamp(4.4 / max(1.0, -view.z), 0.7, 1.5) * uDpr;
  vIntensity = aIntensity;
}`;

export const pulseFragmentShader = `
precision mediump float;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
varying float vIntensity;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  float alpha = pow(1.0 - radius, 1.7) * vIntensity;
  vec3 color = mix(uPrimary, uSecondary, 0.48);
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
varying float vAlpha;
void main() {
  vec3 p = aPosition;
  p.x += sin(uTime * 0.11 + aPhase) * 0.055 * uMotionSpeed;
  p.y += cos(uTime * 0.09 + aPhase * 1.7) * 0.045 * uMotionSpeed;
  p.z += sin(uTime * 0.07 + aPhase * 0.6) * 0.05;
  p.xy += uPointer * 0.035 * uPointerStrength * (0.25 + 0.75 * abs(p.z) / 2.5);
  vec4 view = uModelView * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);
  gl_PointSize = aSize * clamp(4.0 / max(1.0, -view.z), 0.55, 1.3) * uDpr;
  vAlpha = 0.22 + 0.22 * (0.5 + 0.5 * sin(aPhase + uTime * 0.32));
}`;

export const ambientFragmentShader = `
precision mediump float;
uniform vec3 uSecondary;
varying float vAlpha;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius > 1.0) discard;
  gl_FragColor = vec4(uSecondary, (1.0 - radius) * vAlpha);
}`;
