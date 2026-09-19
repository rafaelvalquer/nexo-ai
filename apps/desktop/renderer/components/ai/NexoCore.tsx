import { Component, lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, FileText, MessageSquare, Orbit, Pause, Play, Plus, Settings2, X, Zap } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useVisualStore } from "../../stores/visual";
import { NeuralFallback } from "./neural/NeuralFallback";
import { createNeuralInteraction, leavePointer, updatePointer } from "./neural/neuralInteraction";
import { initialNeuralQuality, shouldRenderNeuralScene } from "./neural/neuralPerformance";
import { neuralColors, neuralStates } from "./neural/neuralStates";
import type { NeuralQuality } from "./neural/types";
import "./neural/neural.css";

const NeuralScene = lazy(() => import("./neural/NeuralScene").then(module => ({default: module.NeuralScene})));

export type NexoCoreVariant = "hero" | "standard" | "compact";
export type NexoCoreProps = {variant?: NexoCoreVariant; interactive?: boolean; showControls?: boolean};

class SceneBoundary extends Component<{children: ReactNode; fallback: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const satelliteRegions = {assistant:2,documents:4,office:3,macros:5,settings:1} as const;

export function NexoCore({variant="standard",interactive=true,showControls=true}:NexoCoreProps) {
  const {state,label}=useVisualStore();
  const navigate=useAppStore(store=>store.setPage);
  const [webgl,setWebgl]=useState<"checking"|"ready"|"unavailable">("checking");
  const [reduced,setReduced]=useState(false),[paused,setPaused]=useState(false),[expanded,setExpanded]=useState(false),[visible,setVisible]=useState(false);
  const [quality,setQuality]=useState<NeuralQuality>(()=>initialNeuralQuality(typeof window==="undefined"?1000:window.innerWidth,typeof navigator==="undefined"?8:navigator.hardwareConcurrency||8));
  const host=useRef<HTMLDivElement>(null);
  const interaction=useRef(createNeuralInteraction());
  interaction.current.expanded=expanded;

  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion=()=>setReduced(media.matches);
    updateMotion();media.addEventListener("change",updateMotion);
    const canvas=document.createElement("canvas");
    try{
      const context=canvas.getContext("webgl");
      setWebgl(context?"ready":"unavailable");
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    }catch{setWebgl("unavailable");}
    const observer=typeof IntersectionObserver==="undefined"?undefined:new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.05});
    if(observer&&host.current)observer.observe(host.current);else setVisible(true);
    return()=>{media.removeEventListener("change",updateMotion);observer?.disconnect();};
  },[]);

  const stopped=paused||reduced||!visible;
  const renderScene=shouldRenderNeuralScene(webgl==="ready",reduced,visible);
  const colors=neuralColors[state],config=neuralStates[state];
  const fallback=<NeuralFallback animated={!stopped}/>;
  const style={
    "--neural-primary":colors.core,
    "--neural-secondary":colors.ring,
    "--neural-glow":colors.glow,
    "--neural-activity":String(config.nodeIntensity),
    "--nucleus-accent":colors.ring,
    "--nucleus-core":colors.core,
    "--nucleus-glow":colors.glow,
    "--nucleus-ring":colors.ring
  } as CSSProperties;

  const activateRegion=(region:number)=>{interaction.current.activeRegion=region;interaction.current.wave=Math.max(interaction.current.wave,.35);};
  const clearRegion=()=>{interaction.current.activeRegion=-1;};

  return <div ref={host} className={`nexoNeuralCore nexoNucleus nexoCore--${variant} ${expanded?"expanded":""} ${stopped?"still":""}`} style={style} data-state={state} data-webgl={webgl}>
    <div className="neuralCoreCoordinates nucleusCoordinates" aria-hidden="true"><span>NEXO / CORE</span><span>LOCAL INTELLIGENCE</span></div>
    <div className="neuralCoreHalo neuralCoreHaloA" aria-hidden="true"/><div className="neuralCoreHalo neuralCoreHaloB" aria-hidden="true"/>
    <div className="neuralCoreFrame" aria-hidden="true"><i/><i/><i/><i/></div>
    <button className="neuralCoreSurface nucleusSurface" aria-label={expanded?"Recolher núcleo do Nexo":"Explorar núcleo do Nexo"} aria-expanded={expanded}
      onClick={()=>setExpanded(value=>!value)}
      onPointerMove={event=>{if(!interactive)return;const rect=event.currentTarget.getBoundingClientRect();updatePointer(interaction.current,(event.clientX-rect.left)/rect.width*2-1,(event.clientY-rect.top)/rect.height*2-1);}}
      onPointerEnter={()=>{if(interactive)interaction.current.hovering=true;}}
      onPointerLeave={()=>leavePointer(interaction.current)}
      onPointerDown={()=>{interaction.current.pressed=true;interaction.current.wave=1;}}
      onPointerUp={()=>{interaction.current.pressed=false;}}
      onKeyDown={event=>{if(event.key==="Escape")setExpanded(false);}}>
      {renderScene?<SceneBoundary fallback={fallback}><Suspense fallback={fallback}><NeuralScene state={state} interaction={interaction} paused={stopped} quality={quality} onQualityChange={setQuality} onUnavailable={()=>setWebgl("unavailable")}/></Suspense></SceneBoundary>:fallback}
    </button>
    {expanded&&<nav className="neuralCoreSatellites nucleusSatellites" aria-label="Atalhos do núcleo">
      <button className="satelliteAssistant" onPointerEnter={()=>activateRegion(satelliteRegions.assistant)} onPointerLeave={clearRegion} onFocus={()=>activateRegion(satelliteRegions.assistant)} onBlur={clearRegion} onClick={()=>navigate("Assistente")}><MessageSquare size={14}/>Conversar<ArrowUpRight size={12}/></button>
      <button className="satelliteDocuments" onPointerEnter={()=>activateRegion(satelliteRegions.documents)} onPointerLeave={clearRegion} onFocus={()=>activateRegion(satelliteRegions.documents)} onBlur={clearRegion} onClick={()=>navigate("Documentos")}><FileText size={14}/>Documentos<ArrowUpRight size={12}/></button>
      <button className="satelliteOffice" onPointerEnter={()=>activateRegion(satelliteRegions.office)} onPointerLeave={clearRegion} onFocus={()=>activateRegion(satelliteRegions.office)} onBlur={clearRegion} onClick={()=>navigate("Escritório")}><Orbit size={14}/>Escritório<ArrowUpRight size={12}/></button>
      <button className="satelliteMacros" onPointerEnter={()=>activateRegion(satelliteRegions.macros)} onPointerLeave={clearRegion} onFocus={()=>activateRegion(satelliteRegions.macros)} onBlur={clearRegion} onClick={()=>navigate("Macros")}><Zap size={14}/>Macros<ArrowUpRight size={12}/></button>
      <button className="satelliteSettings" onPointerEnter={()=>activateRegion(satelliteRegions.settings)} onPointerLeave={clearRegion} onFocus={()=>activateRegion(satelliteRegions.settings)} onBlur={clearRegion} onClick={()=>navigate("Configurações")}><Settings2 size={14}/>Configurações<ArrowUpRight size={12}/></button>
    </nav>}
    <div className="neuralCoreFooter nucleusFooter">
      <div className="neuralCoreState nucleusState" role="status"><i/><span>{label}</span></div>
      {showControls&&<div className="neuralCoreControls nucleusControls">
        <button onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?<X size={12}/>:<Plus size={12}/>} {expanded?"Recolher":"Explorar núcleo"}</button>
        {!reduced&&<button onClick={()=>setPaused(value=>!value)} aria-pressed={paused} aria-label={paused?"Retomar animação":"Pausar animação"}>{paused?<Play size={12}/>:<Pause size={12}/>}</button>}
      </div>}
    </div>
  </div>;
}
