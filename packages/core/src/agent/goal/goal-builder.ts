import { randomUUID } from "node:crypto";
import type { AgentResourceContext, AgentTaskState, GoalStep } from "./goal-types.js";

export class GoalBuilder {
  build(objective:string,resources?:AgentResourceContext):AgentTaskState{
    const steps:GoalStep[]=[];
    const add=(description:string,domains:string[],capabilities?:string[])=>steps.push({id:randomUUID(),description,status:"pending",requiredDomains:domains,requiredCapabilities:capabilities});
    if(/procure|encontre|localize|busque|pesquise/i.test(objective))add("Localizar a informação ou arquivo solicitado",["filesystem","document","browser"]);
    if(resources?.documents.length||/pdf|docx|documento|arquivo anexado/i.test(objective))add("Analisar o documento relevante",["document"]);
    if(/resum/i.test(objective))add("Produzir o resumo solicitado",["document"]);
    if(/crie|salve|gravar|escreva|gerar|vers[aã]o/i.test(objective))add("Criar o artefato solicitado",["filesystem","document"],["filesystem.write"]);
    if(/abra|abrir/i.test(objective))add("Abrir o artefato concluído",["system"]);
    for(let index=1;index<steps.length;index++)steps[index].dependsOn=[steps[index-1].id];
    const outputPath=extractOutputPath(objective);
    const deliverables=outputPath?[{id:randomUUID(),description:`Arquivo ${outputPath}`,path:outputPath,required:true,status:"pending" as const}]:[];
    return{goal:{objective,status:"active",constraints:[],deliverables,steps},currentStepId:steps[0]?.id,selectedToolNames:[],artifacts:[]};
  }
}

function extractOutputPath(value:string){return value.match(/[A-Za-z]:\\[^\r\n"',;]+?\.(?:txt|md|docx|pdf)\b/i)?.[0]??[...value.matchAll(/\b[\wÀ-ÿ_-]+\.(?:txt|md|docx|pdf)\b/gi)].at(-1)?.[0];}
