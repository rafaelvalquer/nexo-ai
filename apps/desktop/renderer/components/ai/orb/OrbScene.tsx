import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AdditiveBlending, Color, type Group, type ShaderMaterial } from "three";
import type { AgentVisualState } from "../../../design/tokens";
import { orbColors } from "./states";
import { coreVertex, coreFragment, particleVertex, particleFragment } from "./shaders";

export type OrbInteraction = { x: number; y: number; expanded: boolean };
type Props = { state: AgentVisualState; interaction: MutableRefObject<OrbInteraction>; paused: boolean };
function Nucleus({ state, interaction, paused }: Props) {
  const group = useRef<Group>(null);
  const core = useRef<ShaderMaterial>(null);
  const cloud = useRef<ShaderMaterial>(null);
  const orbit = useRef<Group>(null);
  const elapsed = useRef(0);
  const colors = orbColors[state];
  const palette = useMemo(() => ({ primary: new Color(colors.core), secondary: new Color(colors.ring) }), [colors]);
  const uniforms = useMemo(() => ({ time: { value: 0 }, primary: { value: new Color("#9775ff") }, secondary: { value: new Color("#63ebf5") } }), []);
  const dustUniforms = useMemo(() => ({ time: { value: 0 }, spread: { value: 0 }, color: { value: new Color("#8cceef") } }), []);
  const particles = useMemo(() => {
    const count = 520, positions = new Float32Array(count * 3), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const seed = ((i * 7919) % 997) / 997, y = 1 - 2 * (i + .5) / count, angle = i * 2.399963;
      const radius = 1.5 + seed * .65, ring = Math.sqrt(1 - y * y);
      positions.set([Math.cos(angle) * ring * radius, y * radius * .78, Math.sin(angle) * ring * radius], i * 3);
      seeds[i] = seed;
    }
    return { positions, seeds };
  }, []);
  useFrame((_, delta) => {
    const step = Math.min(delta, .05), amount = 1 - Math.exp(-step * 4);
    if (!paused) elapsed.current += step * (state === "executing-tool" || state === "responding" ? 1.65 : .7);
    if (core.current) {
      core.current.uniforms.time.value = elapsed.current;
      core.current.uniforms.primary.value.lerp(palette.primary, amount);
      core.current.uniforms.secondary.value.lerp(palette.secondary, amount);
    }
    if (group.current && !paused) {
      group.current.rotation.y += (interaction.current.x * .4 - group.current.rotation.y) * amount;
      group.current.rotation.x += (-interaction.current.y * .25 - group.current.rotation.x) * amount;
      const scale = interaction.current.expanded ? 1.08 : 1;
      group.current.scale.setScalar(group.current.scale.x + (scale - group.current.scale.x) * amount);
    }
    if (orbit.current) {
      orbit.current.rotation.y = elapsed.current * .06;
      orbit.current.rotation.z = Math.sin(elapsed.current * .12) * .12;
    }
    if (cloud.current) {
      cloud.current.uniforms.time.value = elapsed.current;
      cloud.current.uniforms.spread.value += ((interaction.current.expanded ? 1 : 0) - cloud.current.uniforms.spread.value) * amount;
    }
  });
  return <group ref={group} rotation={[.12, -.15, -.15]}>
    <mesh>
      <sphereGeometry args={[.96, 48, 40]} />
      <shaderMaterial ref={core} uniforms={uniforms} vertexShader={coreVertex} fragmentShader={coreFragment} />
    </mesh>
    <mesh rotation={[.3, .5, .2]} scale={1.015}>
      <icosahedronGeometry args={[.96, 2]} />
      <meshBasicMaterial color={colors.ring} wireframe transparent opacity={.065} />
    </mesh>
    <group ref={orbit}>
      {[{ radius: 1.35, tilt: 1.08, spin: .2 }, { radius: 1.52, tilt: -.75, spin: -.45 }, { radius: 1.75, tilt: 1.42, spin: .5 }].map((ring, index) =>
        <group key={index} rotation={[ring.tilt, ring.spin, index * .7]}>
          <mesh><torusGeometry args={[ring.radius, index === 0 ? .008 : .004, 6, 160, Math.PI * 1.85]} /><meshBasicMaterial color={index === 1 ? colors.core : colors.ring} transparent opacity={.5 - index * .09} /></mesh>
          <mesh position={[ring.radius, 0, 0]}><sphereGeometry args={[.025, 12, 8]} /><meshBasicMaterial color="#e9ffff" /></mesh>
        </group>)}
    </group>
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        <bufferAttribute attach="attributes-seed" args={[particles.seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={cloud} uniforms={dustUniforms} vertexShader={particleVertex} fragmentShader={particleFragment} transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  </group>;
}
function RenderClock({ paused }: { paused: boolean }) {
  const invalidate = useThree(scene => scene.invalidate);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => { if (!document.hidden) invalidate(); }, 1000 / 30);
    return () => window.clearInterval(timer);
  }, [paused, invalidate]);
  return null;
}
export function OrbScene(props: Props) {
  return <Canvas className="nucleusCanvas" aria-hidden="true" dpr={[1, 1.25]} frameloop="demand" camera={{ position: [0, 0, 5.6], fov: 43 }} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}>
    <RenderClock paused={props.paused} />
    <Nucleus {...props} />
  </Canvas>;
}

