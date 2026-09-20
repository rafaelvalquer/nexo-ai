import type {DomainCandidate} from "./types.js";
export function deterministicDomainCandidates(text:string):DomainCandidate[]{
  const value=fold(text),out:DomainCandidate[]=[];
  const push=(domain:DomainCandidate["domain"],confidence:number,evidence:string)=>out.push({domain,confidence,source:"deterministic",evidence:[evidence]});
  if(/\b(e-?mails?|gmail|caixa de entrada|remetente|mensagem)\b/.test(value))push("email",.99,"email_marker");
  if(/\b(agenda|calendario|compromisso|reuniao|evento|convite)\b/.test(value))push("calendar",.99,"calendar_marker");
  if(/\b(infomoney|g1|uol|terra|cnn|site|internet|web|noticias?|manchetes?)\b|https?:\/\//.test(value))push("web",.98,"web_marker");
  if(/\b(clique|clicar|preencha|preencher|login|entrar na conta|baixar|download)\b/.test(value)&&/\b(site|pagina|navegador|web|http)/.test(value))push("browser",.995,"browser_interaction");
  if(/\b(downloads?|documents?|documentos?|desktop|area de trabalho|arquivo|arquivos|pasta|pastas|diretorio)\b|\.[a-z0-9]{2,8}\b/.test(value))push("filesystem",.97,"filesystem_marker");
  if(/\b(resuma|resumir|analise|analisar|extraia|extrair)\b/.test(value)&&/\b(documento|pdf|docx|txt|arquivo)\b|\.(pdf|docx|doc|txt)\b/.test(value))push("documents",.995,"document_transform");
  if(/\b(processo|processos|cpu|memoria ram|disco|sistema|servico)\b/.test(value))push("system",.96,"system_marker");
  if(/\b(lembre|lembrar|memoria|guarde que|recorde)\b/.test(value))push("memory",.95,"memory_marker");
  if(!out.length&&!/\b(procure|pesquise|abra|crie|mova|delete|apague|envie|responda|liste|execute)\b/.test(value))push("conversation",.85,"conversation_default");
  const dedup=new Map<string,DomainCandidate>();for(const item of out){const prev=dedup.get(item.domain);if(!prev||item.confidence>prev.confidence)dedup.set(item.domain,item);}
  return[...dedup.values()].sort((a,b)=>b.confidence-a.confidence);
}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
