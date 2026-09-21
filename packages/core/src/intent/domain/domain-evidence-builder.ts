import type {NormalizedIntentInput} from "../types.js";
import {normalizeIntentInputV3} from "../input/input-normalizer-v3.js";
import type {ResolvedIntentDomain} from "./types.js";

export type DomainEvidenceItem={domain:ResolvedIntentDomain;score:number;evidence:string[]};
export type DomainEvidenceSnapshot={input:NormalizedIntentInput;items:DomainEvidenceItem[];top?:DomainEvidenceItem;explicitUrl:boolean;explicitWeb:boolean;strongFilesystem:boolean;explicitFilenameWithoutWebSignal:boolean};

export class DomainEvidenceBuilder{
  build(text:string|NormalizedIntentInput):DomainEvidenceSnapshot{
    const input=typeof text==="string"?normalizeIntentInputV3(text):text;
    const folded=fold(input.routingText),scores=new Map<ResolvedIntentDomain,{score:number;evidence:string[]}>();
    const add=(domain:ResolvedIntentDomain,weight:number,label:string)=>{const row=scores.get(domain)??{score:0,evidence:[]};row.score=Math.min(1,row.score+weight);row.evidence.push(label);scores.set(domain,row);};
    const explicitUrl=/https?:\/\/|\bwww\./i.test(input.original);
    const explicitDomain=/\b(?:[a-z0-9-]+\.)+(?:com\.br|com|org|net|io|dev|ai|br)\b/i.test(input.original);
    const filename=input.literalSegments.some(segment=>segment.type==="filename")&&!explicitDomain;
    const fileWord=/\b(arquivo|arquivos)\b/.test(folded);
    const folderWord=/\b(pasta|pastas|downloads?|documents?|documentos?|desktop|area de trabalho)\b/.test(folded);
    if(filename)add("filesystem",.48,"filename_extension");
    if(fileWord)add("filesystem",.30,"file_word");
    if(folderWord)add("filesystem",.30,"folder_scope");
    if(/\b(crie|criar|altere|alterar|edite|editar|mova|renomeie|apague|escreva)\b/.test(folded)&&(filename||folderWord))add("filesystem",.12,"filesystem_action");
    if(explicitUrl)add("web",.75,"explicit_url");
    if(explicitDomain)add("web",.65,"explicit_domain");
    if(/\b(site|internet|web|pagina)\b/.test(folded))add("web",.35,"web_word");
    if(/\b(noticia|noticias|manchetes)\b/.test(folded))add("web",.35,"information_web_goal");
    if(/\b(clique|preencha|login|navegador)\b/.test(folded))add("browser",.65,"browser_interaction");
    if(/\b(e-?mail|emails|gmail|caixa de entrada|remetente|destinatario)\b/.test(folded))add("email",.85,"email_marker");
    if(/\b(agenda|calendario|reuniao|compromisso|evento|convite)\b/.test(folded))add("calendar",.85,"calendar_marker");
    if(/\b(resuma|resumir|analise|analisar|extraia|extrair|leia|ler)\b/.test(folded)&&/\b(documento|pdf|docx)\b|\.(pdf|docx?|txt)\b/.test(folded))add("documents",.92,"document_content_goal");
    if(/\b(cpu|processos?|memoria ram|disco|servico|sistema)\b/.test(folded))add("system",.75,"system_marker");
    if(/\b(lembre|memorize|memoria do nexo|guarde que)\b/.test(folded))add("memory",.75,"memory_marker");
    const items=[...scores.entries()].map(([domain,row])=>({domain,score:round(row.score),evidence:row.evidence})).sort((a,b)=>b.score-a.score);
    const explicitWeb=explicitUrl||explicitDomain||/\b(site|internet|web|pagina)\b/.test(folded);
    const explicitFilenameWithoutWebSignal=Boolean(filename&&!explicitWeb);
    const strongFilesystem=Boolean(filename&&(folderWord||fileWord||/\b(altere|edite|escreva|mova|renomeie|apague|abra|procure|pesquise|busque)\b/.test(folded)));
    return{input,items,top:items[0],explicitUrl,explicitWeb,strongFilesystem,explicitFilenameWithoutWebSignal};
  }
}
export function domainEvidenceConfidence(snapshot:DomainEvidenceSnapshot,domain:string){return snapshot.items.find(item=>compatibleDomainEvidence(domain,item.domain))?.score??0;}
export function compatibleDomainEvidence(left:string,right:string){if(left===right)return true;return(left==="web"&&right==="browser")||(left==="browser"&&right==="web");}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function round(value:number){return Math.round(value*1000)/1000;}
