import type { AgentOperationalState,OfficeStationId } from "@nexo/shared";
export type ToolVisualMetadata={domain:string;stationId:OfficeStationId;activityLabel:string;animation:AgentOperationalState};
const rules:Array<[RegExp,ToolVisualMetadata]>=[
  [/^(document_|.*pdf|.*docx|.*xlsx|.*pptx)/,{domain:"documents",stationId:"document-station",activityLabel:"Trabalhando em documentos",animation:"executing-tool"}],
  [/^(filesystem_|list_files|search_files|largest_files|read_file|write_file|move_file|copy_file)/,{domain:"filesystem",stationId:"document-station",activityLabel:"Consultando arquivos",animation:"executing-tool"}],
  [/^(email_|gmail_|mail_)/,{domain:"email",stationId:"mail-station",activityLabel:"Consultando e-mails",animation:"executing-tool"}],
  [/^(calendar_|agenda_|event_)/,{domain:"calendar",stationId:"calendar-station",activityLabel:"Organizando agenda",animation:"executing-tool"}],
  [/^(browser_|web_|navigate_|search_web|open_url)/,{domain:"browser",stationId:"browser-station",activityLabel:"Navegando e pesquisando",animation:"executing-tool"}],
  [/^(system_|shell_|application_|memory_usage|disk_usage|process_|run_command|open_app)/,{domain:"system",stationId:"system-station",activityLabel:"Operando o computador",animation:"executing-tool"}],
  [/^(approval_|permission_)/,{domain:"approval",stationId:"approval-gate",activityLabel:"Aguardando aprovação",animation:"awaiting-approval"}]
];
export function visualMetadataForTool(name:string):ToolVisualMetadata{const normalized=name.trim().toLowerCase();return rules.find(([pattern])=>pattern.test(normalized))?.[1]??{domain:"general",stationId:"central-desk",activityLabel:"Executando ferramenta",animation:"executing-tool"};}
