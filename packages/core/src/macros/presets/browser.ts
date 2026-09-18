import type { MacroPreset } from "@nexo/shared";
export const browserMacroPresets: MacroPreset[] = [
  { id:"open-page-daily",version:1,category:"browser",title:"Abrir página diariamente",description:"Abre uma página no horário escolhido.",icon:"globe",requiredCapabilities:[],macro:{name:"Abrir página diariamente",icon:"globe",trigger:{type:"schedule",mode:"daily",time:"09:00"},conditions:[],actions:[{id:"open",type:"browser.open",config:{url:""}}]} },
  { id:"extract-page",version:1,category:"browser",title:"Extrair conteúdo de uma página",description:"Extrai e resume uma página periodicamente.",icon:"scan-text",requiredCapabilities:[],macro:{name:"Extrair página",icon:"scan-text",trigger:{type:"schedule",mode:"daily",time:"09:00"},conditions:[],actions:[{id:"extract",type:"browser.extract",config:{url:""}},{id:"summary",type:"ai.summarize",config:{source:"$actions.extract"}}]} }
];
