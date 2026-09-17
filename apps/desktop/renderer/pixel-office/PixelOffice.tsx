import { useCallback,useEffect,useState } from "react";
import type { OfficeStationId } from "@nexo/shared";
import { PixelOfficeCanvas } from "./PixelOfficeCanvas";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { OfficeToolbar } from "./ui/OfficeToolbar";
import { AgentStatus } from "./ui/AgentStatus";
import { TaskBubble } from "./ui/TaskBubble";
import { ApprovalOverlay } from "./ui/ApprovalOverlay";
import { OfficeDetailsDrawer } from "./ui/OfficeDetailsDrawer";
import { AgentFlowView } from "./ui/AgentFlowView";
import { useAppStore } from "../stores/app";
import { useAssistantStore } from "../stores/assistant";
import "./styles/pixel-office.css";
import "./styles/pixel-office-multi.css";
export function PixelOffice(){
  useAgentEvents();const setPage=useAppStore(s=>s.setPage),selectSession=useAssistantStore(s=>s.selectSession),activeCount=useAssistantStore(s=>s.sessions.filter(session=>session.status==="running"||session.status==="waiting_approval").length),[drawer,setDrawer]=useState<{open:boolean;station?:OfficeStationId}>({open:false}),[flowVisible,setFlowVisible]=useState(false),[immersive,setImmersive]=useState(false);
  useEffect(()=>{if(!immersive)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setImmersive(false);};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[immersive]);
  const openAgent=useCallback((_agentId:string,conversationId?:string)=>{if(conversationId){selectSession(conversationId);setPage("Assistente");}else setDrawer({open:true});},[selectSession,setPage]);
  const openStation=useCallback((station:OfficeStationId)=>setDrawer({open:true,station}),[]),navigate=useCallback((page:string)=>{setDrawer({open:false});setPage(page);},[setPage]);
  return<section className={`pixelOfficePage${immersive?" immersive":""}`}><div className="officeViewport"><PixelOfficeCanvas onAgent={openAgent} onStation={openStation}/><header className="pixelOfficeHeader"><div><span className="eyebrow">NEXO · ESCRITÓRIO</span><h1>Pixel Office</h1><p>{activeCount?`${activeCount} tarefa${activeCount===1?"":"s"} em andamento · quatro agentes especializados.`:"Veja o Nexo trabalhando. Quatro agentes, cada tarefa no seu lugar."}</p></div><button className="flowToggle" onClick={()=>setFlowVisible(value=>!value)} aria-expanded={flowVisible}>{flowVisible?"Ocultar fluxo":"Ver fluxo"}</button></header><div className="officeToolbarOverlay"><OfficeToolbar immersive={immersive} onToggleImmersive={()=>setImmersive(value=>!value)}/></div><TaskBubble/><ApprovalOverlay onOpenDetails={()=>navigate("Aprovações")}/>{flowVisible&&<aside className="officeFlowDrawer"><div className="officeFlowDrawerHeader"><strong>Fluxo textual</strong><button onClick={()=>setFlowVisible(false)}>Fechar</button></div><AgentFlowView/></aside>}<div className="officeBottomStatus"><AgentStatus/><span className="officeCameraHint">Arraste com Shift para mover · roda do mouse para zoom</span></div></div><OfficeDetailsDrawer open={drawer.open} station={drawer.station} onClose={()=>setDrawer({open:false})} onNavigate={navigate}/></section>;
}

