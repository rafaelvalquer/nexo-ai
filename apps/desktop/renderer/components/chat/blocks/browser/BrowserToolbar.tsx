import { useState } from "react";
import { Ban,ExternalLink,Maximize2,Pause,Play,RotateCcw,Send,Square } from "lucide-react";
import type { BrowserRun } from "@nexo/shared/browser-agent";
import { useAssistantStore } from "../../../../stores/assistant";
import { useBrowserRunsStore } from "../../../../stores/browser-runs";
export function BrowserToolbar({run,conversationId,onExpand,onToggleDetails}:{run:BrowserRun;conversationId?:string;onExpand:()=>void;onToggleDetails:()=>void}){
  const control=useBrowserRunsStore(state=>state.control),steer=useBrowserRunsStore(state=>state.steer),send=useAssistantStore(state=>state.send);
  const[instruction,setInstruction]=useState(""),[showSteer,setShowSteer]=useState(false),[busy,setBusy]=useState(false);
  const active=["starting","running","paused","waiting_approval"].includes(run.status);
  async function action(fn:()=>Promise<unknown>){if(busy)return;setBusy(true);try{await fn();}finally{setBusy(false);}}
  async function submitSteer(){const value=instruction.trim();if(!value)return;await action(()=>steer(run.id,value));setInstruction("");setShowSteer(false);}
  return <div className="browserToolbar">
    <div className="browserToolbarButtons">{active?<>
      {run.status==="paused"?<button disabled={busy} onClick={()=>void action(()=>control(run.id,"resume"))}><Play size={14}/>Continuar</button>:<button disabled={busy||run.status==="waiting_approval"} onClick={()=>void action(()=>control(run.id,"pause"))}><Pause size={14}/>Pausar</button>}
      <button disabled={busy} onClick={()=>void action(()=>control(run.id,"cancel"))}><Ban size={14}/>Cancelar</button>
      <button onClick={()=>setShowSteer(value=>!value)}><Send size={14}/>Dar instrução</button>
    </>:<>{conversationId&&<button onClick={()=>void action(()=>send(conversationId,run.request))}><RotateCcw size={14}/>Executar novamente</button>}</>}
      {run.currentUrl&&<button onClick={()=>void window.nexo.openBrowserRun(run.id)}><ExternalLink size={14}/>Abrir página</button>}
      <button onClick={onExpand}><Maximize2 size={14}/>Expandir</button><button onClick={onToggleDetails}><Square size={12}/>Detalhes</button>
    </div>
    {showSteer&&<div className="browserSteer"><input autoFocus value={instruction} onChange={event=>setInstruction(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void submitSteer();}} placeholder="Ex.: Foque apenas em ações brasileiras"/><button disabled={!instruction.trim()||busy} onClick={()=>void submitSteer()}>Enviar</button></div>}
  </div>;
}
