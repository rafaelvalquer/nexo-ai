import {normalizeIntentInputV3} from "../input/input-normalizer-v3.js";

export type ParsedOperationEntities={entities:Record<string,unknown>;evidence:string[]};

/**
 * Extracts only entities that are explicit in the current user turn.
 * Structural text may be typo-normalized, while filename/content/path literals
 * always come from the untouched original input.
 */
export function parseOperationEntities(operation:string,text:string):ParsedOperationEntities{
  const normalized=normalizeIntentInputV3(text);
  const entities:Record<string,unknown>={},evidence:string[]=[];
  const filename=explicitFilename(normalized.original);
  const folder=explicitFolder(normalized.routingText);
  const content=normalized.literalSegments.find(segment=>segment.type==="content")?.value;
  const path=normalized.explicitPaths[0];

  const set=(key:string,value:unknown,label:string)=>{
    if(value===undefined||value===null||value==="")return;
    entities[key]=value;evidence.push(label);
  };

  switch(operation){
    case"write_text_file":
      set("file",filename,"literal_filename");
      set("folder",folder,"explicit_folder");
      set("content",content,"literal_content");
      if(path)set("path",path,"literal_path");
      break;
    case"find_file":
      set("name",filename??searchTarget(normalized.original),"literal_search_target");
      set("folder",folder,"explicit_folder");
      break;
    case"search_files":
      set("query",searchTarget(normalized.original)??filename,"literal_search_query");
      set("folder",folder,"explicit_folder");
      break;
    case"list_files":
      set("folder",folder,"explicit_folder");
      break;
    case"create_text_file":
      set("name",filename,"literal_filename");
      set("folder",folder,"explicit_folder");
      set("content",content,"literal_content");
      break;
    case"create_folder":
      set("name",createdFolderName(normalized.original),"literal_folder_name");
      set("folder",parentFolder(normalized.routingText),"explicit_parent_folder");
      break;
    case"read_file":
    case"file_info":
    case"trash_file":
      set("path",path,"literal_path");
      if(!path)set("file",filename,"literal_filename");
      set("folder",folder,"explicit_folder");
      break;
    case"rename_file":
      set("path",path,"literal_path");
      set("newName",renameTarget(normalized.original),"literal_new_name");
      break;
    case"copy_file":
    case"move_file":{
      const paths=normalized.explicitPaths;
      set("source",paths[0],"literal_source_path");
      set("destination",paths[1],"literal_destination_path");
      break;
    }
    case"web_fetch":
    case"browser_open":
      set("url",explicitUrl(normalized.original),"literal_url");
      break;
    case"web_research":
      set("query",webQuery(normalized.original),"literal_web_query");
      break;
    case"email_send":
      set("to",explicitEmail(normalized.original),"literal_email");
      set("body",messageBody(normalized.original),"literal_message_body");
      break;
    case"email_reply":
      set("body",messageBody(normalized.original),"literal_message_body");
      break;
    case"calendar_create":
      set("title",quotedOrMeetingTitle(normalized.original),"literal_event_title");
      break;
  }
  return{entities,evidence};
}

function explicitFilename(text:string){
  return text.match(/\b[^\s\\/:*?"<>|]+\.[A-Za-z0-9]{1,12}\b/u)?.[0];
}
function explicitFolder(text:string){
  const value=text.match(/\b(?:pasta\s+)?(downloads?|documents?|documentos?|desktop|area de trabalho)\b/iu)?.[1];
  if(!value)return undefined;
  const folded=fold(value);
  if(/^download/.test(folded))return"downloads";
  if(/^(documents?|documentos?)/.test(folded))return"documents";
  if(/desktop|area de trabalho/.test(folded))return"desktop";
  return value;
}
function parentFolder(text:string){return explicitFolder(text);}
function searchTarget(text:string){
  const match=text.match(/\b(?:procure|procurar|busque|buscar|encontre|localize|pesquise|pesquisar)\s+(?:o\s+|a\s+|por\s+)?([^,.;]+?)(?=\s+(?:em|no|na|nos|nas)\s+(?:minha\s+|meu\s+)?(?:pasta\s+)?(?:downloads?|documents?|documentos?|desktop|[aá]rea de trabalho)\b|[,.!?]|$)/iu);
  return match?.[1]?.trim();
}
function createdFolderName(text:string){
  const quoted=text.match(/["“”']([^"“”']+)["“”']/u)?.[1];if(quoted)return quoted;
  return text.match(/\b(?:crie|criar|fa[cç]a|fazer)\s+(?:uma\s+)?(?:pasta|diret[oó]rio)\s+(?:chamad[ao]\s+)?([^,.;]+?)(?=\s+(?:em|no|na|nos|nas)\b|[,.!?]|$)/iu)?.[1]?.trim();
}
function renameTarget(text:string){
  return text.match(/\b(?:renomeie|renomear|mude\s+o\s+nome\s+de)\b[\s\S]*?\b(?:para|como)\s+([^\s,.;]+\.[A-Za-z0-9]{1,12}|[^,.;]+)$/iu)?.[1]?.trim();
}
function explicitUrl(text:string){return text.match(/https?:\/\/[^\s<>"']+/iu)?.[0];}
function explicitEmail(text:string){return text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0]?.toLowerCase();}
function webQuery(text:string){
  const match=text.match(/\b(?:pesquise|pesquisar|procure|buscar|busque|traga|mostre)\s+(?:na\s+web\s+|na\s+internet\s+)?(?:sobre\s+)?([\s\S]+)$/iu);
  return match?.[1]?.trim();
}
function messageBody(text:string){
  const match=text.match(/\b(?:dizendo|com\s+a\s+mensagem|mensagem|corpo)\s*:?\s*([\s\S]+)$/iu);
  return match?.[1]?.trim();
}
function quotedOrMeetingTitle(text:string){
  return text.match(/["“”']([^"“”']+)["“”']/u)?.[1]??text.match(/\b(?:reuni[aã]o|evento|compromisso)\s+(?:chamad[ao]\s+)?([^,.;]+?)(?=\s+(?:amanh[aã]|hoje|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|dia\s+\d|[àa]s\s+\d)|[,.!?]|$)/iu)?.[1]?.trim();
}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
