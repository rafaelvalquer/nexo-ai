import { Float, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";
import type { AgentVisualState } from "../../../design/tokens";
import { orbColors } from "./states";

function Core({ state }: { state: AgentVisualState }) {
  const mesh = useRef<Mesh>(null);
  const colors = orbColors[state];
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * (state === "executing-tool" ? 3.5 : 1.6)) * 0.045;
    mesh.current.scale.setScalar(pulse);
    mesh.current.rotation.y = clock.elapsedTime * 0.18;
  });
  return <mesh ref={mesh}><icosahedronGeometry args={[1, 4]} /><meshStandardMaterial color={colors.core} emissive={colors.glow} emissiveIntensity={1.6} roughness={0.26} metalness={0.38} /></mesh>;
}

function Ring({ radius, state, speed, tilt }: { radius: number; state: AgentVisualState; speed: number; tilt: number }) {
  const ring = useRef<Mesh>(null);
  const color = useMemo(() => orbColors[state].ring, [state]);
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.z = clock.elapsedTime * speed; });
  return <mesh ref={ring} rotation={[tilt, 0, 0]}><torusGeometry args={[radius, 0.012, 8, 96]} /><meshBasicMaterial color={color} transparent opacity={0.66} /></mesh>;
}

function Scene({ state }: { state: AgentVisualState }) {
  const colors = orbColors[state];
  return <><ambientLight intensity={0.6} /><pointLight color={colors.glow} intensity={18} distance={8} /><Float speed={1.8} rotationIntensity={0.24} floatIntensity={0.32}><Core state={state} /><Ring radius={1.3} state={state} speed={0.35} tilt={0.85} /><Ring radius={1.58} state={state} speed={-0.22} tilt={-0.62} /><Sparkles count={state === "executing-tool" ? 42 : 24} scale={4.2} size={1.8} speed={0.45} color={colors.ring} /></Float></>;
}

export function OrbScene({ state }: { state: AgentVisualState }) {
  return <Canvas className="orbCanvas" dpr={[1, 1.5]} camera={{ position: [0, 0, 4.5], fov: 42 }} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}><Scene state={state} /></Canvas>;
}
