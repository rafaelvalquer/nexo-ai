export type MacroTriggerCatalogItem = { id:string;title:string;description:string;icon:string;category:"schedule"|"email"|"filesystem"|"calendar"|"system";requiredCapabilities:string[] };
export const MACRO_TRIGGER_CATALOG: MacroTriggerCatalogItem[] = [
  { id:"schedule",title:"Horário",description:"Uma vez, diariamente, dias úteis, dias específicos, semanal ou mensal.",icon:"clock",category:"schedule",requiredCapabilities:[] },
  { id:"interval",title:"Intervalo",description:"Executa a cada quantidade definida de minutos.",icon:"timer",category:"schedule",requiredCapabilities:[] },
  { id:"email.received",title:"E-mail",description:"Quando uma nova mensagem chegar em uma conta conectada.",icon:"mail",category:"email",requiredCapabilities:["email.read"] },
  { id:"file.created",title:"Arquivo criado",description:"Quando um arquivo novo aparecer em uma pasta.",icon:"file-plus",category:"filesystem",requiredCapabilities:[] },
  { id:"file.changed",title:"Arquivo alterado",description:"Quando um arquivo monitorado for alterado.",icon:"file-pen",category:"filesystem",requiredCapabilities:[] },
  { id:"file.deleted",title:"Arquivo removido",description:"Quando um arquivo monitorado for removido.",icon:"file-x",category:"filesystem",requiredCapabilities:[] },
  { id:"calendar.before_event",title:"Antes de compromisso",description:"15 min, 30 min, 1 hora ou 1 dia antes de um evento.",icon:"calendar-clock",category:"calendar",requiredCapabilities:["calendar.read"] },
  { id:"calendar.event_started",title:"Compromisso iniciado",description:"Quando um evento da agenda começar.",icon:"calendar-check",category:"calendar",requiredCapabilities:["calendar.read"] },
  { id:"system.threshold",title:"Sistema",description:"Quando disco ou memória ultrapassar um limite.",icon:"gauge",category:"system",requiredCapabilities:[] }
];
