import { lazy, Suspense, useEffect, useState } from "react";
import { useVisualStore } from "../../stores/visual";
const OrbScene = lazy(() => import("./orb/OrbScene").then(module => ({ default: module.OrbScene })));

export function NexoOrb({ compact = false }: { compact?: boolean }) {
  const { state, label } = useVisualStore();
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(typeof window !== "undefined" && !!window.WebGLRenderingContext && !window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return <div className={`nexoOrb ${compact ? "compact" : ""} ${state}`} role="status" aria-label={label}>
    {webgl ? <Suspense fallback={<><span className="orbCore">N</span><span className="orbRing" /><span className="orbRing second" /></>}><OrbScene state={state} /></Suspense> : <><span className="orbCore">N</span><span className="orbRing" /><span className="orbRing second" /></>}
    <span className="orbLabel">{label}</span>
  </div>;
}
