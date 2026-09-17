import { useEffect, useState } from "react";
import type { NexoSettings } from "@nexo/shared";
import { useAppStore } from "../../stores/app";

export function Onboarding() {
  const [settings,setSettings]=useState<NexoSettings|null>(null); const [ollama,setOllama]=useState<{ok:boolean;detail:string}|null>(null); const setPage=useAppStore(s=>s.setPage);
  useEffect(()=>{void Promise.all([window.nexo.getSettings(),window.nexo.status()]).then(([current,status]:any)=>{setSettings(current);setOllama(status.llm);});},[]);
  if(!settings||settings.onboardingCompleted)return null;
  const complete=async()=>{await window.nexo.updateSettings({onboardingCompleted:true});setSettings({...settings,onboardingCompleted:true});};
  return <div className="onboardingOverlay" role="dialog" aria-modal="true" aria-label="Boas-vindas ao Nexo"><section className="onboardingCard"><span className="eyebrow">BEM-VINDO AO NEXO</span><h1>Seu assistente local está pronto para ser configurado.</h1><ol><li className={ollama?.ok?"done":""}><b>IA local</b><span>{ollama?.ok?"Ollama está disponível.":ollama?"Ollama não encontrado. Instale/inicie o serviço e volte a testar em Configurações.":"Verificando Ollama…"}</span></li><li><b>Contas</b><span>Conecte Google ou Microsoft para e-mail e calendário, quando quiser.</span><button className="ghost" onClick={()=>setPage("Configurações")}>Abrir Configurações</button></li><li><b>Autonomia e pastas</b><span>Defina permissões e pastas autorizadas antes de automatizar tarefas.</span><button className="ghost" onClick={()=>setPage("Configurações")}>Abrir Configurações</button></li></ol><div className="actions"><button className="ghost" onClick={()=>void complete()}>Pular por enquanto</button><button onClick={()=>void complete()}>Concluir</button></div></section></div>;
}
