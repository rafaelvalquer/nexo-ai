import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowRight, Cpu, FolderOpen, Orbit, ShieldCheck, Sparkles } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";
import { useVisualStore } from "../stores/visual";
import { NexoOrb } from "../components/ai/NexoOrb";
import "./today.css";

type LocalStatus = { llm?: { ok?: boolean }; settings?: { model?: string; autonomy?: string; allowedRoots?: string[] }; tools?: unknown[] };
export function Today() {
  const [status, setLocal] = useState<LocalStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const setStatus = useAppStore(store => store.setStatus), navigate = useAppStore(store => store.setPage);
  const tasks = useAssistantStore(store => store.tasks);
  const setVisual = useVisualStore(store => store.set);
  useEffect(() => {
    let alive = true;
    window.nexo.status().then(value => { if (alive) { setLocal(value as LocalStatus); setStatus(value); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [setStatus]);
  useEffect(() => {
    if (failed || (status && !status.llm?.ok)) { setVisual("offline"); return; }
    const active = tasks.find(task => task.status === "waiting_approval") ?? tasks.find(task => task.status === "running" || task.status === "queued");
    if (!active) { setVisual("idle"); return; }
    setVisual(active.status === "waiting_approval" ? "awaiting-approval" : active.progressText ? "responding" : "planning", active.statusMessage);
  }, [tasks, status, failed, setVisual]);
  const connected = Boolean(status?.llm?.ok);
  const autonomy = ({ balanced: "Equilibrada", cautious: "Cautelosa", autonomous: "Autônoma" } as Record<string, string>)[status?.settings?.autonomy ?? ""] ?? "—";
  return <div className="todayPage">
    <header className="todayHeading"><div><span className="todayEyebrow">SEU ESPAÇO DE POSSIBILIDADES</span><h1>Ideias em movimento.</h1></div><span className={`todayConnection ${connected ? "online" : ""}`}><i />{status ? connected ? "Conectado localmente" : "Ollama desconectado" : failed ? "Conexão indisponível" : "Conectando…"}</span></header>
    <section className="todayHero" aria-label="Núcleo Nexo">
      <div className="todayHeroCopy">
        <span className="todayEdition"><i />NEXO INTELLIGENCE<span>01 / NÚCLEO</span></span>
        <h2>Do pensamento<br />ao <em>próximo passo.</em></h2>
        <p>Um espaço para transformar suas ideias em ações. Converse, explore seus arquivos e acompanhe seus agentes — tudo no seu computador.</p>
        <button className="todayPrimary" onClick={() => navigate("Assistente")}>Vamos criar algo<ArrowRight size={17} /></button>
        <div className="todayTrust"><ShieldCheck size={13} />Local por natureza. Sob seu controle.</div>
      </div>
      <NexoOrb />
      <div className="todayHeroCaption"><span>INTELIGÊNCIA QUE GANHA FORMA</span><span>Mova o ponteiro. Explore o núcleo.<ArrowUpRight size={12} /></span></div>
    </section>
    <section className="todaySignals" aria-label="Seu ambiente">
      <div><Cpu size={15} /><span>Modelo ativo<strong>{status?.settings?.model ?? "—"}</strong></span></div>
      <div><ShieldCheck size={15} /><span>Autonomia<strong>{autonomy}</strong></span></div>
      <div><Sparkles size={15} /><span>Ferramentas<strong>{status ? status.tools?.length ?? 0 : "—"}<small> disponíveis</small></strong></span></div>
      <div><FolderOpen size={15} /><span>Pastas<strong>{status ? status.settings?.allowedRoots?.length ?? 0 : "—"}<small> liberadas</small></strong></span></div>
    </section>
    <div className="todaySectionHeading"><h2>Qual é o próximo movimento?</h2><span>ESCOLHA UM CAMINHO</span></div>
    <div className="todayPaths">
      <button onClick={() => navigate("Assistente")}><span className="pathNumber">01</span><Sparkles className="pathIcon" size={22} /><h3>Pense junto.</h3><p>Uma ideia, uma pergunta ou um plano. Comece uma conversa.</p><span className="pathLink">Abrir assistente<ArrowUpRight size={16} /></span></button>
      <button onClick={() => navigate("Documentos")}><span className="pathNumber">02</span><FolderOpen className="pathIcon" size={22} /><h3>Conecte as peças.</h3><p>Encontre contexto e novas respostas nos seus documentos.</p><span className="pathLink">Explorar documentos<ArrowUpRight size={16} /></span></button>
      <button onClick={() => navigate("Escritório")}><span className="pathNumber">03</span><Orbit className="pathIcon" size={22} /><h3>Veja acontecer.</h3><p>Entre no escritório e acompanhe cada polvo em ação.</p><span className="pathLink">Visitar escritório<ArrowUpRight size={16} /></span></button>
    </div>
  </div>;
}

