import type { LucideIcon } from "lucide-react";
import "./gadget-loading.css";

export function GadgetLoadingState({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <div className="gadgetLoadingState" role="status" aria-busy="true" aria-label={`Carregando ${label}`}>
    <header><Icon size={14} aria-hidden="true" /><b>{label}</b><span>Carregando…</span></header>
    {[0, 1, 2].map(row => <div className="gadgetLoadingRow" key={row}><i /><span><b /><strong /><small /></span></div>)}
  </div>;
}
