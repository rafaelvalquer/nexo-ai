import type { BrowserRunEvent } from "@nexo/shared/browser-agent";
type StoredEvent={id:string;type:string;label:string|null;url:string|null;created_at:string};
export function BrowserTimeline({events,history}:{events:BrowserRunEvent[];history:StoredEvent[]}){
  const historical=history.map(item=>({key:item.id,label:item.label??labelFor(item.type,item.url),time:item.created_at}));
  const live=events.map((item,index)=>({key:`live-${index}-${item.timestamp}`,label:labelForLive(item),time:item.timestamp}));
  const rows=[...historical,...live].filter((item,index,array)=>index===0||item.label!==array[index-1]?.label).slice(-12);
  return <ol className="browserTimeline">{rows.map(item=><li key={item.key}><span/><div><strong>{item.label}</strong><small>{new Date(item.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small></div></li>)}</ol>;
}
function labelFor(type:string,url:string|null){if(type==="browser.navigation"&&url)return`Navegou para ${safeHost(url)}`;if(type==="browser.started")return"Navegador iniciado";if(type==="browser.completed")return"Execução concluída";if(type==="browser.failed")return"Execução falhou";return type.replace("browser.","").replaceAll("_"," ");}
function labelForLive(event:BrowserRunEvent){if(event.type==="browser.step")return event.label;if(event.type==="browser.navigation")return`Navegou para ${safeHost(event.url)}`;if(event.type==="browser.approval_requested")return event.label;if(event.type==="browser.status")return event.status==="paused"?"Execução pausada":"Execução retomada";if(event.type==="browser.completed")return"Execução concluída";if(event.type==="browser.failed")return event.error;if(event.type==="browser.cancelled")return"Execução cancelada";return"Navegador iniciado";}
function safeHost(url:string){try{return new URL(url).hostname;}catch{return url;}}
