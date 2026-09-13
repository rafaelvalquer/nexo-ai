import type { OfficeStationId } from "@nexo/shared";

export type Facing="up"|"down"|"left"|"right";
export type WorldPoint={x:number;y:number};
export type CameraFocus={x:number;y:number;zoom:number};
export type OfficeStation={
  id:OfficeStationId;
  name:string;
  activity:string;
  description:string;
  icon:string;
  accent:number;
  x:number;
  y:number;
  facing:Facing;
  workingFacing:Facing;
  capacity:number;
  slots:WorldPoint[];
  cameraFocus:CameraFocus;
  targetPage?:string;
};

export const OFFICE_WIDTH=1536;
export const OFFICE_HEIGHT=1024;
export const GRID_SIZE=32;

const slots=(points:Array<[number,number]>):WorldPoint[]=>points.map(([x,y])=>({x,y}));

export const OFFICE_STATIONS:Record<OfficeStationId,OfficeStation>={
  "central-desk":{
    id:"central-desk",name:"Mesa central",activity:"Raciocínio e planejamento",
    description:"Interpretação do pedido, planejamento, coordenação dos agentes e preparação da resposta.",
    icon:"✦",accent:0x8f76ff,x:768,y:640,facing:"up",workingFacing:"up",capacity:4,
    slots:slots([[704,640],[768,640],[832,640],[896,640]]),cameraFocus:{x:790,y:575,zoom:1.28},targetPage:"Assistente"
  },
  "document-station":{
    id:"document-station",name:"Documentos",activity:"Arquivos e documentos",
    description:"Leitura, pesquisa, criação e edição de PDFs, DOCX e arquivos locais.",
    icon:"▤",accent:0xbca7ff,x:320,y:320,facing:"up",workingFacing:"up",capacity:4,
    slots:slots([[256,320],[320,320],[384,320],[448,320]]),cameraFocus:{x:336,y:326,zoom:1.42},targetPage:"Documentos"
  },
  "mail-station":{
    id:"mail-station",name:"E-mail",activity:"Caixa de entrada",
    description:"Busca, leitura, organização, preparação e envio de mensagens de e-mail.",
    icon:"✉",accent:0x65d5ff,x:1088,y:320,facing:"up",workingFacing:"up",capacity:4,
    slots:slots([[1024,320],[1088,320],[1152,320],[1216,320]]),cameraFocus:{x:1092,y:315,zoom:1.42},targetPage:"Conexões"
  },
  "calendar-station":{
    id:"calendar-station",name:"Calendário",activity:"Agenda e compromissos",
    description:"Consulta de agenda, criação de eventos, conflitos e organização do calendário.",
    icon:"▣",accent:0xffd166,x:1088,y:416,facing:"up",workingFacing:"up",capacity:4,
    slots:slots([[1024,384],[1088,384],[1152,384],[1216,384]]),cameraFocus:{x:1090,y:405,zoom:1.42},targetPage:"Conexões"
  },
  "browser-station":{
    id:"browser-station",name:"Browser Agent",activity:"Pesquisa e navegação",
    description:"Navegação em páginas, pesquisa web e automação do navegador.",
    icon:"◎",accent:0x5be1ff,x:1280,y:544,facing:"right",workingFacing:"right",capacity:4,
    slots:slots([[1088,512],[1152,512],[1216,512],[1280,512]]),cameraFocus:{x:1220,y:520,zoom:1.38}
  },
  "system-station":{
    id:"system-station",name:"Sistema local",activity:"Computador e comandos",
    description:"Processos, aplicações, disco, memória, terminal e ações permitidas no computador.",
    icon:"⌘",accent:0x68e6a7,x:384,y:640,facing:"left",workingFacing:"left",capacity:4,
    slots:slots([[320,640],[384,640],[448,640],[512,640]]),cameraFocus:{x:382,y:616,zoom:1.4},targetPage:"Atividade"
  },
  "approval-gate":{
    id:"approval-gate",name:"Portão de aprovação",activity:"Aguardando autorização",
    description:"Operações sensíveis ficam aqui até serem aprovadas ou recusadas pelo usuário.",
    icon:"!",accent:0xffc857,x:1088,y:768,facing:"down",workingFacing:"down",capacity:4,
    slots:slots([[1024,768],[1088,768],[1152,768],[1216,768]]),cameraFocus:{x:1110,y:745,zoom:1.45},targetPage:"Aprovações"
  },
  "rest-area":{
    id:"rest-area",name:"Área de descanso",activity:"Livre / aguardando trabalho",
    description:"Agentes sem tarefas podem circular, descansar e aguardar o próximo trabalho.",
    icon:"☕",accent:0x98a8c8,x:768,y:256,facing:"down",workingFacing:"down",capacity:4,
    slots:slots([[640,256],[704,256],[768,256],[832,256]]),cameraFocus:{x:766,y:278,zoom:1.34}
  }
};

export const STATION_SLOTS:Record<OfficeStationId,WorldPoint[]>=Object.fromEntries(
  Object.entries(OFFICE_STATIONS).map(([id,station])=>[id,station.slots])
) as Record<OfficeStationId,WorldPoint[]>;

export const AGENT_SPAWNS:Record<string,WorldPoint>={
  "agent-1":{x:704,y:640},"agent-2":{x:768,y:640},"agent-3":{x:832,y:640},"agent-4":{x:896,y:640}
};

export const IDLE_WANDER_POINTS:WorldPoint[]=[
  {x:640,y:256},{x:896,y:256},{x:576,y:448},{x:960,y:448},
  {x:448,y:704},{x:896,y:704},{x:704,y:640},{x:832,y:640}
];

export function slotFor(station:OfficeStationId,agentId:string){
  const index=Math.max(0,Math.min(3,(Number(agentId.match(/(\d+)$/)?.[1])||1)-1));
  return OFFICE_STATIONS[station].slots[index]??OFFICE_STATIONS[station];
}
