const tool=(name,properties={},required=[])=>({type:"function",function:{name,description:`Execute ${name}`,parameters:{type:"object",properties,required,additionalProperties:false}}});
const string={type:"string"};
export const scenarios=[
  {id:"single-system",request:"Quanto de memória RAM este computador possui?",tools:[tool("system_info"),tool("memory_usage"),tool("disk_usage")],accepted:["system_info","memory_usage"],tier:"simple"},
  {id:"single-email",request:"Mostre o e-mail mais recente",tools:[tool("email_latest"),tool("email_search",{maxResults:{type:"integer"}}),tool("email_get",{messageId:string},["messageId"])],accepted:["email_latest"],tier:"simple"},
  {id:"single-calendar",request:"O que tenho na agenda amanhã?",tools:[tool("calendar_list_agent",{naturalDate:string,dayPart:{type:"string",enum:["manhã","tarde","noite"]}},["naturalDate"]),tool("calendar_get",{eventId:string},["eventId"])],accepted:["calendar_list_agent"],tier:"simple"},
  {id:"single-folder",request:"Liste os arquivos em Downloads",tools:[tool("list_files",{path:string},["path"]),tool("search_files",{path:string,query:string},["path","query"]),tool("file_info",{path:string},["path"])],accepted:["list_files"],tier:"simple"},
  {id:"mutation-folder",request:"Crie a pasta Relatorios em Downloads",tools:[tool("create_folder",{path:string},["path"]),tool("list_files",{path:string},["path"]),tool("file_info",{path:string},["path"])],accepted:["create_folder"],tier:"mutation"},
  {id:"multi-document",request:"Importe C:\\dados\\relatorio.pdf e depois resuma o documento",tools:[tool("document_import_path",{path:string},["path"]),tool("document_summarize",{documentIds:{type:"array",items:string},instruction:string},["documentIds"]),tool("document_get",{documentId:string},["documentId"])],accepted:["document_import_path"],tier:"multi"}
];
