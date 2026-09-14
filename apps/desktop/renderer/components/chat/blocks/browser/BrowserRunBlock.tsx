import { useEffect,useMemo,useRef,useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { BrowserRun,BrowserRunBlock as BrowserRunBlockModel } from "@nexo/shared/browser-agent";
import { BrowserApproval } from "./BrowserApproval";
import { BrowserProgress } from "./BrowserProgress";
import { BrowserResultCards } from "./BrowserResultCards";
import { BrowserStatus } from "./BrowserStatus";
import { BrowserTimeline } from "./BrowserTimeline";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserViewport } from "./BrowserViewport";
import { useBrowserRun } from "./useBrowserRun";
import "./browser-run.css";

export function BrowserRunBlock({block,conversationId}:{block:BrowserRunBlockModel;conversationId?:string}){
  const{run:loaded,liveEvents,history,approval}=useBrowserRun(block.runId),[expanded,setExpanded]=useState(false),[details,setDetails]=useState(false),rootRef=useRef<HTMLElement|null>(null),scrolledRef=useRef(false);
  const run=loaded??fallbackRun(block,conversationId);
  useEffect(()=>{if(!scrolledRef.current&&rootRef.current){scrolledRef.current=true;rootRef.current.scrollIntoView({behavior:"smooth",block:"nearest"});}},[block.runId]);
  const host=useMemo(()=>{try{return run.currentUrl?new URL(run.currentUrl).hostname:"";}catch{return"";}},[run.currentUrl]);
  const elapsed=durationLabel(run);
  return <section ref={rootRef} className={`browserRunBlock ${run.status}`} data-browser-run={run.id}>
    <header className="browserRunHeader"><div><BrowserStatus run={run}/><strong>{block.title||"Nexo Browser"}</strong></div><span title={run.currentUrl}>{host||"Nexo Browser"}</span></header>
    <BrowserViewport run={run}/><BrowserProgress run={run}/>
    {approval&&run.status==="waiting_approval"&&<BrowserApproval event={approval}/>} 
    <BrowserToolbar run={run} conversationId={conversationId} onExpand={()=>setExpanded(true)} onToggleDetails={()=>setDetails(value=>!value)}/>
    {details&&<BrowserTimeline events={liveEvents} history={history}/>} 
    {run.status==="completed"&&<div className="browserCompletion"><div><strong>Pesquisa concluída</strong><small>{run.stepCount} etapa(s){elapsed?` · ${elapsed}`:""}</small></div>{run.finalResult&&<BrowserResultCards result={run.finalResult}/>}</div>}
    {run.status==="failed"&&<p className="browserError" role="alert">{run.error??"O Browser Agent não conseguiu concluir a execução."}</p>}
    {run.status==="cancelled"&&<p className="browserCancelled" role="status">Execução cancelada.</p>}
    {expanded&&createPortal(<div className="browserModal" role="dialog" aria-modal="true" aria-label="Nexo Browser"><div className="browserModalCard"><header><div><BrowserStatus run={run}/><strong>Nexo Browser</strong></div><button aria-label="Fechar" onClick={()=>setExpanded(false)}><X size={18}/></button></header><BrowserViewport run={run} expanded/><BrowserProgress run={run}/><BrowserToolbar run={run} conversationId={conversationId} onExpand={()=>undefined} onToggleDetails={()=>setDetails(value=>!value)}/>{details&&<BrowserTimeline events={liveEvents} history={history}/>}</div></div>,document.body)}
  </section>;
}
function fallbackRun(block:BrowserRunBlockModel,conversationId?:string):BrowserRun{return{id:block.runId,taskId:"",conversationId:conversationId??"",request:block.title,status:block.status,mode:"research",allowedDomains:[],currentUrl:block.url,pageTitle:block.pageTitle,currentStep:block.step,stepCount:0,startedAt:block.startedAt,finishedAt:block.finishedAt,finalThumbnail:block.finalThumbnail};}
function durationLabel(run:BrowserRun){if(!run.finishedAt)return"";const ms=Math.max(0,Date.parse(run.finishedAt)-Date.parse(run.startedAt)),seconds=Math.round(ms/1000);return seconds<60?`${seconds} s`:`${Math.floor(seconds/60)} min ${seconds%60} s`;}
