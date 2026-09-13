import { useCallback,useState } from "react";
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
export function PixelOffice(){useAgentEvents();const setPage=useAppStore(s=>s.setPage),selectSession=useAssistantStore(s=>s.selectSession),[drawer,setDrawer]=useState<{open:boolean;station?:OfficeStationId}>({open:false}),[flowVisible,setFlowVisible]=useState(false);const openAgent=useCallback((_agentId:string,conversationId?:string)=>{if(conversationId){selectSession(conversationId);setPage("Assistente");}else setDrawer({open:true});},[selectSession,setPage]);const openStation=useCallback((station:OfficeStationId)=>setDrawer({open:true,station}),[]),navigate=useCallback((page:string)=>{setDrawer({open:false});setPage(page);},[setPage]);return<section className="pixelOfficePage"><header className="pixelOfficeHeader"><div><span className="eyebrow">NEXO · IA LOCAL</span><h1>Pixel Office</h1><p>Até quatro agentes visuais trabalhando de forma independente.</p></div><button className="flowToggle" onClick={()=>setFlowVisible(value=>!value)}>{flowVisible?"Ocultar fluxo":"Ver fluxo textual"}</button></header><OfficeToolbar/><div className="officeWorkspace"><div className="officeViewport"><PixelOfficeCanvas onAgent={openAgent} onStation={openStation}/><TaskBubble/><ApprovalOverlay onOpenDetails={()=>navigate("Aprovações")}/></div>{flowVisible&&<AgentFlowView/>}</div><AgentStatus/><OfficeDetailsDrawer open={drawer.open} station={drawer.station} onClose={()=>setDrawer({open:false})} onNavigate={navigate}/></section>;}
