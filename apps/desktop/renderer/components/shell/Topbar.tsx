import { Cpu } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useVisualStore } from "../../stores/visual";
export function Topbar() { const page=useAppStore(s=>s.page); const visual=useVisualStore(); const status=useAppStore(s=>s.status) as any; return <div className="topbar"><div><span className="topbarEyebrow">NEXO AI / {page}</span><strong>{visual.label}</strong></div><div className={`coreBadge ${status?.llm?.ok ? "ok" : ""}`}><Cpu size={14}/>{status?.settings?.model ?? "Modelo local"}</div></div>; }
