import type { OfficeStationId } from "@nexo/shared";
import type { AgentAnimationState } from "./AgentStateMachine";
import type { OctopusAnimation } from "../data/sprite-manifest";

export function animationForStation(state:AgentAnimationState,station:OfficeStationId):OctopusAnimation{
  if(state!=="working")return state==="walking"||state==="wander"?"idle":state;
  switch(station){
    case"central-desk":return"planning";
    case"document-station":return"reading";
    case"mail-station":return"mailing";
    case"calendar-station":return"planning";
    case"browser-station":return"browsing";
    case"system-station":return"system";
    case"approval-gate":return"approval";
    case"rest-area":return"idle";
  }
}

export function bubbleVerb(station:OfficeStationId){
  switch(station){
    case"central-desk":return"Pensando";
    case"document-station":return"Trabalhando em documentos";
    case"mail-station":return"Consultando e-mails";
    case"calendar-station":return"Organizando agenda";
    case"browser-station":return"Navegando";
    case"system-station":return"Operando o computador";
    case"approval-gate":return"Aguardando sua aprovação";
    case"rest-area":return"Disponível";
  }
}
