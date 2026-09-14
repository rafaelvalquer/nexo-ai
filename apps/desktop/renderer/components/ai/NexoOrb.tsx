import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, FileText, MessageSquare, Orbit, Pause, Play, Plus, X } from "lucide-react";
import { useVisualStore } from "../../stores/visual";
import { useAppStore } from "../../stores/app";
import type { OrbInteraction } from "./orb/OrbScene";
import { orbColors } from "./orb/states";
import "./orb/nucleus.css";
const OrbScene = lazy(() => import("./orb/OrbScene").then(module => ({ default: module.OrbScene })));

function Fallback() {
  return <div className="nucleusFallback" aria-hidden="true"><div /><i /><i /><i /></div>;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}
export function NexoOrb({ compact = false }: { compact?: boolean }) {
  const { state, label } = useVisualStore();
  const navigate = useAppStore(store => store.setPage);
  const [webgl, setWebgl] = useState(false), [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false), [expanded, setExpanded] = useState(false), [visible, setVisible] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const interaction = useRef<OrbInteraction>({ x: 0, y: 0, expanded: false });
  interaction.current.expanded = expanded;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    const canvas = document.createElement("canvas");
    try {
      const context = canvas.getContext("webgl2");
      setWebgl(Boolean(context));
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { setWebgl(false); }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .05 });
    if (host.current) observer.observe(host.current);
    return () => { media.removeEventListener("change", update); observer.disconnect(); };
  }, []);
  const stopped = paused || reduced || !visible;
  return <div ref={host} className={`nexoNucleus ${compact ? "compact" : ""} ${expanded ? "expanded" : ""} ${stopped ? "still" : ""}`} style={{ "--nucleus-accent": orbColors[state].ring } as CSSProperties}>
    <div className="nucleusCoordinates" aria-hidden="true"><span>NEXO / CORE</span><span>LOCAL INTELLIGENCE</span></div>
    <div className="nucleusHalo" aria-hidden="true" />
    <div className="nucleusReticle" aria-hidden="true" />
    <button className="nucleusSurface" aria-label={expanded ? "Recolher núcleo do Nexo" : "Explorar núcleo do Nexo"} aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}
      onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); interaction.current.x = (event.clientX - rect.left) / rect.width * 2 - 1; interaction.current.y = (event.clientY - rect.top) / rect.height * 2 - 1; }}
      onPointerLeave={() => { interaction.current.x = 0; interaction.current.y = 0; }}
      onKeyDown={event => { if (event.key === "Escape") setExpanded(false); }}>
      {webgl && !reduced ? <SceneBoundary><Suspense fallback={<Fallback />}><OrbScene state={state} interaction={interaction} paused={stopped} /></Suspense></SceneBoundary> : <Fallback />}
    </button>
    {expanded && <nav className="nucleusSatellites" aria-label="Atalhos do núcleo">
      <button onClick={() => navigate("Assistente")}><MessageSquare size={14} />Conversar<ArrowUpRight size={12} /></button>
      <button onClick={() => navigate("Documentos")}><FileText size={14} />Documentos<ArrowUpRight size={12} /></button>
      <button onClick={() => navigate("Escritório")}><Orbit size={14} />Escritório<ArrowUpRight size={12} /></button>
    </nav>}
    <div className="nucleusFooter">
      <div className="nucleusState" role="status"><i /><span>{label}</span></div>
      <div className="nucleusControls">
        <button onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? <X size={12} /> : <Plus size={12} />}{expanded ? "Recolher" : "Explorar núcleo"}</button>
        {!reduced && <button onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? "Retomar animação" : "Pausar animação"}>{paused ? <Play size={12} /> : <Pause size={12} />}</button>}
      </div>
    </div>
  </div>;
}

