import { randomUUID } from "node:crypto";
import type { AgentResourceContext, AgentTaskState, GoalStep } from "./goal-types.js";

export class GoalBuilder {
  build(objective:string,resources?:AgentResourceContext):AgentTaskState{
    const steps:GoalStep[]=[];
    const add=(description:string,domains:string[],capabilities?:string[])=>steps.push({id:randomUUID(),description,status:"pending",requiredDomains:domains,requiredCapabilities:capabilities,attempts:[],maxAttempts:3});
    const paths=extractPaths(objective);
    const outputPath=paths.find(path=>isOutputPath(objective,path));
    if(/\bliste|\blistar/i.test(objective))add("Listar os arquivos ou itens solicitados",["filesystem"]);
    if(/procure|encontre|localize|busque|pesquise/i.test(objective))add("Localizar a informação ou arquivo solicitado",["filesystem","document","browser"]);
    if(resources?.documents.length||/pdf|docx|documento|arquivo anexado/i.test(objective))add("Analisar o documento relevante",["document"]);
    if(/resum/i.test(objective))add("Produzir o resumo solicitado",["document"]);
    if(/crie|salve|gravar|escreva|gerar|vers[aã]o/i.test(objective))add("Criar o artefato solicitado",["filesystem","document"],["filesystem.write"]);
    if(outputPath)add("Validar o artefato físico produzido",["filesystem","document"]);
    if(/abra|abrir/i.test(objective))add("Abrir o artefato concluído",["system"]);
    for(let index=1;index<steps.length;index++)steps[index].dependsOn=[steps[index-1].id];
    const deliverables=outputPath?[{id:randomUUID(),description:`Arquivo ${outputPath}`,path:outputPath,required:true,status:"pending" as const}]:[];
    const inputPaths=paths.filter(path=>path!==outputPath).map(path=>({id:randomUUID(),kind:"input" as const,description:`Arquivo de entrada ${path}`,path}));
    const documents=(resources?.documents??[]).map(document=>({id:randomUUID(),kind:"input" as const,description:`Documento ${document.name}`,documentId:document.id,path:document.path,mimeType:document.mimeType}));
    return{goal:{objective,status:"active",constraints:[],resources:[...inputPaths,...documents],deliverables,steps},currentStepId:steps[0]?.id,selectedToolNames:[],artifacts:[]};
  }
}

function extractPaths(value:string){return [...new Set([...value.matchAll(/[A-Za-z]:\\[^\r\n"',;]+?\.(?:txt|md|docx|pdf)\b|\b[\wÀ-ÿ_-]+\.(?:txt|md|docx|pdf)\b/gi)].map(match=>match[0]))];}
function isOutputPath(objective:string,path:string){const index=objective.toLowerCase().lastIndexOf(path.toLowerCase());const context=objective.slice(Math.max(0,index-90),index+path.length+30);return /(?:crie|criar|gere|gerar|salve|salvar|grave|gravar|escreva|escrever|exporte|exportar|produza|produzir|vers[aã]o)(?:.|\s){0,90}$/i.test(context.slice(0,Math.max(0,context.toLowerCase().lastIndexOf(path.toLowerCase()))))||/\b(?:em|como|para)\s+["']?$/i.test(context.slice(0,Math.max(0,context.toLowerCase().lastIndexOf(path.toLowerCase()))))&&/(?:crie|gere|salve|grave|escreva|exporte|produza)/i.test(objective);}
