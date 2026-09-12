import type { OfficeStationId } from "@nexo/shared";
export type Facing="up"|"down"|"left"|"right";export type OfficeStation={id:OfficeStationId;name:string;x:number;y:number;facing:Facing;targetPage?:string};
export const OFFICE_WIDTH=1536,OFFICE_HEIGHT=1024,GRID_SIZE=64;
export const OFFICE_STATIONS:Record<OfficeStationId,OfficeStation>={
  "central-desk":{id:"central-desk",name:"Mesa central",x:760,y:650,facing:"up",targetPage:"Assistente"},
  "document-station":{id:"document-station",name:"Documentos",x:300,y:350,facing:"up",targetPage:"Documentos"},
  "mail-station":{id:"mail-station",name:"E-mail",x:1080,y:300,facing:"up",targetPage:"Conexões"},
  "calendar-station":{id:"calendar-station",name:"Calendário",x:1010,y:350,facing:"up",targetPage:"Conexões"},
  "browser-station":{id:"browser-station",name:"Browser Agent",x:1270,y:540,facing:"right"},
  "system-station":{id:"system-station",name:"Sistema local",x:340,y:670,facing:"left",targetPage:"Atividade"},
  "approval-gate":{id:"approval-gate",name:"Portão de aprovação",x:1110,y:790,facing:"down",targetPage:"Aprovações"},
  "rest-area":{id:"rest-area",name:"Descanso",x:760,y:245,facing:"down"}
};
