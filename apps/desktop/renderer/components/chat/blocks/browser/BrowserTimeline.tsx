import type { BrowserDiagnosticEventName, BrowserRunEvent, BrowserRunPhase } from "@nexo/shared/browser-agent";
import { browserPhaseLabel } from "./browser-phase";

type StoredEvent={id:string;type:string;label:string|null;url:string|null;metadata_json?:string|null;created_at:string};

export function BrowserTimeline({events,history}:{events:BrowserRunEvent[];history:StoredEvent[]}){
  const historical=history.map(item=>({key:item.id,label:labelForStored(item),time:item.created_at}));
  const live=events.map((item,index)=>({key:item.id??`live-${index}-${item.timestamp}`,label:labelForLive(item),time:item.timestamp}));
  const rows=[...new Map([...historical,...live].map(item=>[item.key,item])).values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-16);
  return <ol className="browserTimeline">{rows.map(item=><li key={item.key}><span/><div><strong>{item.label}</strong><small>{new Date(item.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small></div></li>)}</ol>;
}

function labelForStored(item:StoredEvent){
  if(item.type==="browser.navigation"&&item.url)return`Navegou para ${safeHost(item.url)}`;
  if(item.type==="browser.started")return"Execução iniciada";
  if(item.type==="browser.completed")return"Execução concluída";
  if(item.type==="browser.failed")return item.label??"Execução falhou";
  if(item.type==="browser.phase"&&item.label)return browserPhaseLabel(item.label as BrowserRunPhase)??item.label;
  if(item.type==="browser.diagnostic"&&item.label){
    const meta=parseMetadata(item.metadata_json);
    return diagnosticLabel(item.label as BrowserDiagnosticEventName,meta.durationMs);
  }
  return item.label??item.type.replace("browser.","").replaceAll("_"," ");
}

function labelForLive(event:BrowserRunEvent){
  if(event.type==="browser.step")return event.label;
  if(event.type==="browser.navigation")return`Navegou para ${safeHost(event.url)}`;
  if(event.type==="browser.phase")return browserPhaseLabel(event.phase)??event.phase;
  if(event.type==="browser.diagnostic")return diagnosticLabel(event.event,event.durationMs);
  if(event.type==="browser.approval_requested")return event.label;
  if(event.type==="browser.status")return event.status==="paused"?"Execução pausada":event.status==="running"?"Navegador ativo":event.status==="waiting_approval"?"Aguardando aprovação":event.status==="starting"?"Preparando navegador":"Estado atualizado";
  if(event.type==="browser.completed")return"Execução concluída";
  if(event.type==="browser.failed")return event.error;
  if(event.type==="browser.cancelled")return"Execução cancelada";
  return"Execução iniciada";
}

function diagnosticLabel(event:BrowserDiagnosticEventName,durationMs?:number){
  const labels:Record<BrowserDiagnosticEventName,string>={
    browser_process_started:"Chrome iniciado",
    cdp_connected:"CDP conectado",
    ollama_check_started:"Verificando Ollama",
    ollama_check_completed:"Ollama verificado",
    ollama_request_started:"Testando tool calling via /api/chat",
    ollama_request_completed:"Modelo validado via Ollama nativo",
    agent_loading:"Carregando Browser Use",
    agent_loaded:"Browser Use carregado",
    agent_created:"Browser Agent criado",
    first_turn_started:"Primeiro turno iniciado",
    first_model_response_started:"Primeira resposta do modelo iniciada",
    first_model_response_delta:"Primeiro delta do modelo recebido",
    first_model_response_completed:"Primeira resposta do modelo concluída",
    first_model_tool_call_received:"Primeiro tool call recebido",
    model_turn_completed:"Turno do modelo concluído",
    first_action_started:"Primeira ação iniciada",
    first_navigation:"Primeira navegação concluída"
  };
  return durationMs===undefined?labels[event]:`${labels[event]} · ${durationMs} ms`;
}

function parseMetadata(value?:string|null){
  if(!value)return{} as {durationMs?:number};
  try{const parsed=JSON.parse(value) as {durationMs?:unknown};return{durationMs:typeof parsed.durationMs==="number"?parsed.durationMs:undefined};}catch{return{} as {durationMs?:number};}
}
function safeHost(url:string){try{return new URL(url).hostname;}catch{return url;}}
