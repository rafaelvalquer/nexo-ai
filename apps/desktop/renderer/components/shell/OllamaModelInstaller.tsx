import { useEffect, useState } from "react";
import { Progress } from "../ui/Progress";

declare global { interface Window { nexoOllama?: { pull(model: string): Promise<unknown>; onProgress(callback: (event: { status?: string; completed?: number; total?: number }) => void): () => void; }; } }

export function OllamaModelInstaller() {
  const [model, setModel] = useState<string>(); const [progress, setProgress] = useState<{ status?: string; completed?: number; total?: number }>(); const [busy, setBusy] = useState(false); const [error,setError]=useState<string>();
  useEffect(() => { void window.nexo.status().then((status: any) => { if (status.llm?.ok && !(status.models ?? []).includes(status.settings?.model)) setModel(status.settings?.model); }); }, []);
  useEffect(() => window.nexoOllama?.onProgress(setProgress), []);
  if (!model || !window.nexoOllama) return null;
  const percent = progress?.total ? Math.min(100, Math.round((progress.completed ?? 0) / progress.total * 100)) : undefined;
  const pull=async()=>{setBusy(true);setError(undefined);try{await window.nexoOllama!.pull(model);setModel(undefined);setProgress(undefined);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}};
  return <aside className="modelInstaller" role="status">
    <b>Modelo local necessário</b>
    <span>{busy ? `${progress?.status ?? "Baixando…"}${percent === undefined ? "" : ` · ${percent}%`}` : `${model} ainda não está instalado.`}</span>
    {busy && <Progress label={`Download do modelo ${model}`} value={percent} valueLabel={percent === undefined ? "Baixando modelo" : `${percent}% do download concluído`} />}
    {error && <span className="notice error" role="alert">{error}</span>}
    <button disabled={busy} onClick={() => void pull()}>{busy ? "Baixando…" : error ? "Tentar novamente" : "Baixar modelo"}</button>
  </aside>;
}
