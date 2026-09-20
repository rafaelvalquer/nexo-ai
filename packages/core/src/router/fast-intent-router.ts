import {FilesystemCommandResolver,filesystemCommandTool} from "../filesystem/intent/filesystem-command-resolver.js";

export type DeterministicRoute =
  | {type:"tool";tool:string;input:Record<string,unknown>;explanation?:string}
  | {type:"macro";operation:string;input:Record<string,unknown>;explanation?:string}
  | {type:"chat";response?:string;stream?:true}
  | {type:"unknown"};

/**
 * Focused exact router. It intentionally contains only high-precision grammars;
 * fuzzy/cross-domain interpretation belongs to Candidate Pool + Global Arbiter.
 */
export class FastIntentRouter{
 private readonly filesystem=new FilesystemCommandResolver();

 route(text:string,options:{allowedRoots?:string[]}={}):DeterministicRoute{
  const internal=internalMacroAction(text);if(internal)return internal;
  const macro=macroRoute(text);if(macro)return macro;
  const filesystem=this.filesystem.resolve(text,options.allowedRoots??[]);
  if(filesystem){const step=filesystemCommandTool(filesystem);return{type:"tool",tool:step.tool,input:step.input,explanation:step.explanation};}

  const normalized=fold(text);
  if(/\b(programas?|processos?)\b/.test(normalized)&&/\b(memoria|ram)\b/.test(normalized)&&/\b(consumindo|usando|gastando|maior|mais)\b/.test(normalized))return tool("process_list",{limit:25,sortBy:"memory"},"Verificando quais processos consomem mais memória…");
  if(/\b(?:verifique|mostre|qual|uso).*\bmemoria\b|\bmemoria.*\buso\b/.test(normalized))return tool("memory_usage",{},"Verificando o uso de memória…");
  if(/\b(?:verifique|mostre|qual|uso).*\bdisco\b|\bdisco.*\b(?:uso|ocupado)\b/.test(normalized))return tool("disk_usage",{},"Verificando o uso dos discos…");
  if(/^\s*resumo\s+diario\b/.test(normalized))return tool("daily_summary",{},"Montando seu resumo local do dia…");

  if(/\bqual\s+(?:e\s+)?(?:o\s+)?meu\s+nome|\bsabe.*meu\s+nome|\blembra.*meu\s+nome|\bcomo\s+eu\s+me\s+chamo/.test(normalized))return tool("memory_search",{query:"user.name"},"Consultando seu nome na memória local…");
  const saveName=text.match(/\b(?:salv[ae]|guard[ae]|lembre|memorize)\s+(?:que\s+)?meu\s+nome\s+[eé]\s+([A-Za-zÀ-ÿ\s]+?)(?:[,.!?]|$)/i);
  if(saveName)return tool("memory_save",{key:"user.name",value:saveName[1].trim(),category:"profile"},"Salvando seu nome na memória local…");
  if(/\b(?:esque[cç]a|apague|remova).*\bmeu\s+nome\b/i.test(text))return tool("memory_delete",{key:"user.name"},"Preparando a remoção do seu nome da memória…");

  const app=text.match(/\b(?:abra|abrir|abre)\s+(?:o\s+)?(chrome|google chrome|edge|microsoft edge|vscode|visual studio code|android studio|explorer)\b/i);
  if(app)return tool("open_application",{application:app[1]} ,`Abrindo ${app[1]}…`);
  if(/\b(?:abra|abrir|inicie|iniciar)\s+(?:o\s+)?(?:navegador|browser)\b/i.test(text))return tool("browser_launch",{},"Abrindo o navegador controlado do Nexo…");

  const url=explicitOrKnownUrl(text);
  if(url&&/\b(?:abra|abrir|acesse|acessar|entre|entrar|navegue|navegar)\b/i.test(text)){
    if(/\b(?:clique|preencha|fa[cç]a login|entre na conta|selecione)\b/i.test(text))return tool("browser_agent_run",{request:text,url},"Executando a interação solicitada no navegador…");
    return tool("browser_open",{url},`Abrindo ${url}…`);
  }

  if(/^\s*(?:oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalized)||/^\s*(?:vamos conversar|me ensine|me explique)\b/.test(normalized))return{type:"chat",stream:true};
  return{type:"unknown"};
 }
}

function internalMacroAction(text:string):DeterministicRoute|undefined{
 const match=text.match(/^\s*\[\[NEXO_TOOL:(browser_download|browser_click|browser_type)\]\]\s*(\{[\s\S]*\})\s*$/);
 if(!match)return undefined;
 try{
  const input=JSON.parse(match[2]) as Record<string,unknown>,name=match[1];
  if(typeof input.selector!=="string")return undefined;
  if(name==="browser_download"&&typeof input.path!=="string")return undefined;
  if(name==="browser_type"&&typeof input.text!=="string")return undefined;
  return tool(name,input,"Executando ação estruturada do navegador…");
 }catch{return undefined;}
}
function macroRoute(text:string):DeterministicRoute|undefined{
 if(/\b(?:liste|listar|mostre|mostrar|quais|minhas)\b.*\bmacros?\b/i.test(text))return{type:"macro",operation:"list",input:{},explanation:"Consultando suas macros…"};
 const run=text.match(/\b(?:execute|executa|rode|rodar|inicie|iniciar)\s+(?:a\s+)?(?:minha\s+)?macro\s+["“]?(.+?)["”]?[.!?]*$/i);
 if(run)return{type:"macro",operation:"run",input:{name:run[1].trim()},explanation:`Preparando a execução da macro ${run[1].trim()}…`};
 return undefined;
}
function explicitOrKnownUrl(text:string){
 const explicit=text.match(/https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/i)?.[0];
 if(explicit)return normalizeUrl(explicit);
 const aliases:Array<[RegExp,string]>=[[/\binfomoney\b/i,"https://www.infomoney.com.br"],[/\bgoogle\b/i,"https://www.google.com"],[/\bgithub\b/i,"https://github.com"],[/\byoutube\b/i,"https://www.youtube.com"],[/\blinkedin\b/i,"https://www.linkedin.com"],[/\binstagram\b/i,"https://www.instagram.com"]];
 return aliases.find(([pattern])=>pattern.test(text))?.[1];
}
function normalizeUrl(value:string){const clean=value.trim().replace(/[),.;!?]+$/g,"");return/^https?:\/\//i.test(clean)?clean:`https://${clean}`;}
function tool(name:string,input:Record<string,unknown>,explanation?:string):DeterministicRoute{return{type:"tool",tool:name,input,...(explanation?{explanation}:{})};}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();}
