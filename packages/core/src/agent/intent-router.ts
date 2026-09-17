import path from "node:path";
import os from "node:os";
import type { Plan } from "./planner.js";
import { LocationRegistry } from "../locations/location-registry.js";
import { PathIntentResolver } from "../locations/path-intent-resolver.js";

function homeFolder(name: "Downloads" | "Documents" | "Desktop") {
  return path.join(os.homedir(), name);
}

function knownFolderFromText(text: string): string | null {
  if (/\b(downloads?|pasta\s+downloads?)\b/i.test(text)) return homeFolder("Downloads");
  if (/\b(documentos?|documents?)\b/i.test(text)) return homeFolder("Documents");
  if (/\b(desktop|[aá]rea\s+de\s+trabalho)\b/i.test(text)) return homeFolder("Desktop");
  const absolute = text.match(/\b([A-Za-z]:\\[^\n,;]+)/);
  return absolute?.[1]?.trim() ?? null;
}

function normalizeUrl(raw: string) {
  const clean = raw.trim().replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function explicitWebUrl(text:string){const value=text.match(/https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/i)?.[0];if(!value)return undefined;const clean=value.replace(/[),.;!?]+$/g,"");return /^https?:\/\//i.test(clean)?clean:`https://${clean}`;}

function siteFromText(text: string): string | null {
  const explicit = text.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/[^\s]*)?)/i);
  if (explicit) return normalizeUrl(explicit[1]);
  const aliases: Array<[RegExp, string]> = [
    [/\binfomoney\b/i, "https://www.infomoney.com.br"],
    [/\bvalor(?:\s+econ[oô]mico|\s+investe)?\b/i, "https://valor.globo.com"],
    [/\binvesting(?:\.com)?\b/i, "https://br.investing.com"],
    [/\bg1\b/i, "https://g1.globo.com"],
    [/\buol\b/i, "https://www.uol.com.br"],
    [/\blinkedin\b/i, "https://www.linkedin.com"],
    [/\bgoogle\b/i, "https://www.google.com"],
    [/\binstagram\b/i, "https://www.instagram.com"],
    [/\byoutube\b/i, "https://www.youtube.com"],
    [/\bgithub\b/i, "https://github.com"]
  ];
  return aliases.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function isBrowserAction(text: string) {
  return /\b(abra|abrir|abre|acesse|acessar|entre|entrar|navegue|navegar|ir\s+para)\b/i.test(text) &&
    /\b(navegador|browser|site|p[aá]gina|url|google|instagram|youtube|github|infomoney|investing|linkedin)|https?:\/\/|\bwww\./i.test(text);
}

/** Explicit web research must never fall back to e-mail or local-file search. */
function isBrowserAgentTask(text:string) {
  if(/\b(resuma|resumir|analise|analisar|leia|ler|explique)\b/i.test(text)&&/\.(?:pdf|docx?|xlsx?|txt|md|csv|json)\b/i.test(text))return false;
  if (/\b(e-?mails?|gmail|caixa\s+de\s+entrada|agenda|calend[aá]rio|arquivos?|pastas?|downloads?|desktop|[aá]rea\s+de\s+trabalho)\b/i.test(text)) return false;
  const researchVerb=/\b(pesquise|pesquisar|procure|procurar|busque|buscar|investigue|investigar|analise|analisar|leia|ler|resuma|resumir|compare|comparar|verifique|verificar|consulte|consultar|encontre|encontrar|veja)\b/i.test(text);
  const explicitWeb=/\b(internet|web|site|p[aá]gina|not[ií]cias?\s+(?:de|do|da|no|na)|infomoney|investing|valor(?:\s+econ[oô]mico|\s+investe)?|g1|uol|linkedin|youtube|github)\b|https?:\/\/|\bwww\./i.test(text);
  return researchVerb && (explicitWeb || Boolean(siteFromText(text)));
}

export class FastIntentRouter {
  route(text: string, options:{allowedRoots?:string[]}={}): Plan | null {
    const normalized = text.toLowerCase().trim();
    const locations=new LocationRegistry({},[],options.allowedRoots??[]);

    if(/\b(confirmo|pode\s+criar|salve|salvar)\b/i.test(text)&&/\b(macro|rascunho)\b/i.test(text))return{tool:"macro_confirm_draft",input:{confirm:true},explanation:"Salvando o rascunho da macro pausada…"};
    if(/\b(cancele|cancelar|descarte|descartar)\b/i.test(text)&&/\b(macro|rascunho)\b/i.test(text))return{tool:"macro_confirm_draft",input:{confirm:false},explanation:"Descartando o rascunho da macro…"};
    const macroCreate=text.match(/\b(?:crie|criar|monte|montar)\s+(?:uma\s+)?macro\s+(?:chamada\s+)?["“]?(.+?)["”]?\s+(?:que|para)\s+(.+?)[.!?]*$/i);
    if(macroCreate&&macroCreate[2])return{tool:"macro_create_draft",input:{name:macroCreate[1].trim(),description:macroCreate[2].trim()},explanation:"Preparando um rascunho de macro para sua revisão…"};
    if(/\b(liste|listar|mostre|mostrar|quais|minhas)\b/i.test(text)&&/\bmacros?\b/i.test(text))return{tool:"macro_list",input:{},explanation:"Consultando suas macros…"};
    const macroRun=text.match(/\b(?:execute|executa|rode|rodar|inicie|iniciar)\s+(?:a\s+)?(?:minha\s+)?macro\s+["“]?(.+?)["”]?[.!?]*$/i);
    if(macroRun)return{tool:"macro_run",input:{name:macroRun[1].trim()},explanation:`Preparando a execução da macro ${macroRun[1].trim()}…`};

    const macroDownload=text.match(/^\s*\[\[NEXO_TOOL:browser_download\]\]\s*(\{[\s\S]*\})\s*$/);
    if(macroDownload){try{const input=JSON.parse(macroDownload[1]) as Record<string,unknown>;if(typeof input.selector==="string"&&typeof input.path==="string")return{tool:"browser_download",input:{selector:input.selector,path:input.path},explanation:"Baixando o arquivo na página aberta; a ação será validada e confirmada conforme suas permissões…"};}catch{/* Invalid internal action payload falls through to normal intent handling. */}}
    const macroBrowserAction=text.match(/^\s*\[\[NEXO_TOOL:(browser_click|browser_type)\]\]\s*(\{[\s\S]*\})\s*$/);
    if(macroBrowserAction){try{const input=JSON.parse(macroBrowserAction[2]) as Record<string,unknown>;if(typeof input.selector==="string"&&(macroBrowserAction[1]==="browser_click"||typeof input.text==="string"))return{tool:macroBrowserAction[1],input,explanation:macroBrowserAction[1]==="browser_click"?"Clicando no elemento selecionado…":"Preenchendo o campo selecionado…"};}catch{/* Invalid internal action payload falls through to normal intent handling. */}}

    if (/computador.*lento|pc.*lento|porque.*(?:computador|pc).*lento|por que.*(?:computador|pc).*lento/.test(normalized)) {
      return { steps: [
        { tool: "system_info", input: {}, explanation: "Coletando informações do sistema…" },
        { tool: "memory_usage", input: {}, explanation: "Verificando uso de memória…" },
        { tool: "disk_usage", input: {}, explanation: "Verificando espaço em disco…" },
        { tool: "process_list", input: { limit: 12 }, explanation: "Analisando processos em execução…" }
      ] };
    }
    if (/\b(programas?|processos?)\b/i.test(text) && /\b(mem[oó]ria|ram)\b/i.test(text) && /\b(consumindo|usando|gastando|maior|mais)\b/i.test(text)) {
      return { tool:"process_list",input:{limit:25,sortBy:"memory"},explanation:"Verificando quais processos consomem mais memória…" };
    }
    if (/uso.*mem[oó]ria|mem[oó]ria.*uso/.test(normalized)) return { tool: "memory_usage", input: {}, explanation: "Verificando o uso de memória…" };
    if (/uso.*disco|disco.*ocupado/.test(normalized)) return { tool: "disk_usage", input: {}, explanation: "Verificando o uso dos discos…" };
    if (/^\s*resumo\s+di[aá]rio\b/i.test(text)) return { tool: "daily_summary", input: {}, explanation: "Montando seu resumo local do dia…" };

    if (/\b(o que|oque|quais).*(voc[eê]).*(pode|consegue).*(fazer)|\b(capacidades|recursos).*nexo\b/i.test(normalized)) {
      return { direct: [
        "Atualmente o Nexo pode:",
        "• conversar usando o modelo local do Ollama;",
        "• diagnosticar uso de memória, disco e processos;",
        "• listar, pesquisar e analisar arquivos em pastas autorizadas;",
        "• identificar os maiores arquivos de uma pasta;",
        "• abrir aplicativos e um navegador controlado;",
        "• acessar sites pelo Browser Agent;",
        "• salvar, consultar e remover memórias locais;",
        "• executar automações em segundo plano.",
        "",
        "Integrações como Gmail precisam estar conectadas e autorizadas antes de o Nexo poder ler e-mails."
      ].join("\n") };
    }

    if (/\b(selecionar|alterar|mudar|configurar|escolher)\b/i.test(text) && /\b(caixas?|abas?).*(e-?mails?|gmail)|\b(e-?mails?|gmail).*(caixas?|abas?)\b/i.test(text)) {
      return { uiFlow: "email_mailbox_preferences" };
    }

    const mentionsEmail=/\b(e-?mails?|gmail|caixa\s+de\s+entrada|mensagens?\s+recebidas?)\b/i.test(text);
    if (mentionsEmail && /\b([uú]ltim[oa]|mais\s+recente|recentemente\s+recebido)\b/i.test(text)) {
      return { tool:"email_latest", input:{}, explanation:"Buscando o e-mail mais recente da caixa de entrada…" };
    }
    if (mentionsEmail && /\b(quantos?|quantidade|total)\b/i.test(text)) {
      return { tool:"email_stats", input:{}, explanation:"Consultando as estatísticas da conta de e-mail…" };
    }
    if (mentionsEmail && /\b(n[aã]o lidos?|unread)\b/i.test(text) && /\b(quantos?|quantidade|total)\b/i.test(text)) {
      return { tool:"email_stats", input:{}, explanation:"Consultando a quantidade de e-mails não lidos…" };
    }
    if (mentionsEmail && /\b(n[aã]o lidos?|unread|chegaram|recebidos?)\b/i.test(text)) {
      return { tool:"email_search", input:{unread:true,maxResults:20}, explanation:"Consultando e-mails não lidos na conta conectada…" };
    }
    if (mentionsEmail) return { tool:"email_search", input:{maxResults:20}, explanation:"Consultando a conta de e-mail conectada…" };

    if (/\b(configur|adicion|alter|gerenci).*(pastas?\s+permitidas?)|\bpastas?\s+permitidas?\b/i.test(text)) {
      return { direct: "Abra Configurações → Segurança → Pastas permitidas. Downloads, Documents e Desktop são autorizadas por padrão; você pode adicionar outras pastas manualmente." };
    }

    const refersToCurrentPage=/\b(esta|essa|a atual)\s+(p[aá]gina|site|artigo)\b/i.test(text);
    if (isBrowserAgentTask(text) && !(refersToCurrentPage&&!explicitWebUrl(text))) {
      const personal=/\b(minha\s+conta|log(?:in|ar)|autenticad[oa]|sess[aã]o\s+salva|meu\s+perfil)\b/i.test(text);
      if(personal)return { tool:"browser_agent_run", input:{request:text,mode:"personal"}, explanation:"Executando a tarefa autenticada no navegador…" };
      const page=explicitWebUrl(text);
      if(page&&/\b(leia|ler|resuma|resumir|extraia|extrair|conte[uú]do)\b/i.test(text))return{tool:"web_fetch",input:{url:page,maxChars:16000},explanation:"Lendo a página sem abrir navegador…"};
      const query=text.replace(/^\s*(?:por favor[, ]*)?(?:pesquise|pesquisar|pesquisa|procure|procurar|busque|buscar|encontre|veja|consulte)\s+/i,"").replace(/^\s*(?:sobre|na internet|na web)\s+/i,"").trim()||text;
      return { tool:"web_search", input:{query,maxResults:6}, explanation:"Pesquisando na web…" };
    }

    if (isBrowserAction(text)) {
      const url = siteFromText(text);
      if (url) return { tool: "browser_open", input: { url }, explanation: `Abrindo o navegador e acessando ${url}…` };
      if (/\b(navegador|browser|chrome|edge)\b/i.test(text)) return { tool: "browser_launch", input: {}, explanation: "Abrindo o navegador controlado do Nexo…" };
    }

    const openFolder=/\b(?:abra|abrir|abre|acesse|acessar)\b.*\b(?:pasta|diret[oó]rio)\s+(?:chamad[oa]\s+)?(.+?)\s*[.!?]*$/i.exec(text);
    if(openFolder){
      const requested=openFolder[1].replace(/^["'“”]|["'“”]$/g,"").trim();
      const resolved=new PathIntentResolver(locations).resolve(requested);
      if(resolved.status==="resolved"&&resolved.resolvedPath)return{tool:"open_path",input:{path:resolved.resolvedPath},explanation:`Abrindo a pasta ${requested}…`};
    }

    const app = text.match(/\b(?:abra|abrir|abre)\s+(?:o\s+)?(chrome|google chrome|edge|microsoft edge|vscode|visual studio code|android studio|explorer)\b/i);
    if (app) return { tool: "open_application", input: { application: app[1] }, explanation: `Abrindo ${app[1]}…` };

    const supportedExtension="(?:pdf|docx?|xlsx?|txt|md|csv|json|png|jpe?g)";
    const fileName=text.match(new RegExp(`[\"“]([^\"”]+\\.${supportedExtension})[\"”]` ,"iu"))?.[1]?.trim()??text.match(new RegExp(`(?:^|\\s)([^\\\\/:*?\"<>|\\s]+\\.${supportedExtension})(?=\\s|[.!?,;:]?$)`,"iu"))?.[1]?.trim();
    if(fileName&&/\b(resuma|resumir|analise|analisar|leia|ler|explique|explorar)\b/i.test(text))return{tool:"document_summarize_named",input:{fileName},explanation:`Localizando e analisando ${fileName} nas pastas permitidas…`};
    if(fileName&&/\b(procure|procurar|pesquise|pesquisar|busque|buscar|encontre|localize|ache)\b/i.test(text)&&options.allowedRoots?.length)return{tool:"search_files",input:{paths:options.allowedRoots,query:fileName},explanation:`Procurando ${fileName} nas pastas permitidas…`};

    const folder = knownFolderFromText(text);
    if (folder && /\b(maiores?|mais\s+pesados?|ocupam?\s+mais\s+espa[cç]o|arquivos?\s+grandes?)\b/i.test(text)) {
      return { tool: "largest_files", input: { path: folder, limit: 15, maxDepth: 4 }, explanation: `Analisando os maiores arquivos em ${folder}…` };
    }
    if (folder && /\b(liste|listar|lista|mostre|mostrar|ver|veja)\b/i.test(text) && /\barquivos?|itens?\b/i.test(text)) return { tool: "list_files", input: { path: folder }, explanation: `Listando arquivos em ${folder}…` };
    const search = text.match(/(?:encontre|procure|pesquise).*?([^\s]+\.(?:pdf|docx?|xlsx?|txt|jpg|png)|pdfs?|arquivos?)/i);
    if (folder && search) return { tool: "search_files", input: { path: folder, query: search[1].replace(/s$/i, "") }, explanation: "Pesquisando os arquivos…" };

    const saveName = text.match(/meu\s+nome\s+[eé]\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)(?=\s*(?:,|\.|!|\?|$))/i);
    const asksToRemember = /\b(salv|guard|lembr|memor)/i.test(text);
    if (saveName && asksToRemember) return { tool: "memory_save", input: { key: "user.name", value: saveName[1].trim(), category: "profile" }, explanation: "Salvando seu nome na memória local…" };
    const saveNamePrefix = text.match(/(?:salv[ae]|guard[ae]|lembre|memorize)\s+(?:que\s+)?meu\s+nome\s+[eé]\s+([A-Za-zÀ-ÿ\s]+?)(?:[,.!?]|$)/i);
    if (saveNamePrefix) return { tool: "memory_save", input: { key: "user.name", value: saveNamePrefix[1].trim(), category: "profile" }, explanation: "Salvando seu nome na memória local…" };
    if (/qual\s+(?:[eé]\s+)?(?:o\s+)?meu\s+nome|sabe\s+(?:qual\s+[eé]\s+)?(?:o\s+)?meu\s+nome|lembra\s+(?:d[eo]\s+)?meu\s+nome|como\s+eu\s+me\s+chamo/i.test(text)) return { tool: "memory_search", input: { query: "user.name" }, explanation: "Consultando seu nome na memória local…" };
    if (/esque[cç]a\s+(?:o\s+)?meu\s+nome|apague\s+(?:o\s+)?meu\s+nome|remova\s+(?:o\s+)?meu\s+nome/i.test(text)) return { tool: "memory_delete", input: { key: "user.name" }, explanation: "Preparando a remoção do seu nome da memória…" };

    const saveProjectMatch = text.match(/meu\s+projeto\s+([^\s]+)\s+fica\s+em\s+(.+?)(?:[,.]\s|$)/i);
    if (saveProjectMatch && asksToRemember) return { tool: "memory_save", input: { key: `project.${saveProjectMatch[1].toLowerCase()}.path`, value: saveProjectMatch[2].trim(), category: "project" }, explanation: `Salvando caminho do projeto ${saveProjectMatch[1]}…` };

    return null;
  }
}
