import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./assistant.css";

// The renderer normally receives this bridge from Electron. A tiny development
// bridge keeps browser-only visual QA usable without changing production data.
if (import.meta.env.DEV && !window.nexo) {
  const settings = { model:"qwen3:4b",ollamaUrl:"http://127.0.0.1:11434",autonomy:"balanced",allowedRoots:[],privateMode:false,runInBackground:true,memoryEnabled:true,memoryAskBeforeSave:true,embeddingModel:"nomic-embed-text",documentMaxSizeMb:50,externalDataRetention:"local",connectionsEnabled:true,browserAutomationEnabled:true,fileWritesEnabled:true,requireApprovalForEmail:false,allowedDomains:[],dataRetentionDays:30,ocrEnabled:false,onboardingCompleted:true,oauth:{googleClientId:"",microsoftClientId:"",microsoftTenant:"common"} };
  const previewMessages:any[]=[];let previewTasks:any[]=[];
  Object.defineProperty(window,"nexo",{value:{
    chatHistory:async()=>previewMessages,listActiveTasks:async()=>previewTasks,getTask:async(id:string)=>previewTasks.find(task=>task.id===id),startChatTask:async(text:string)=>{const id=crypto.randomUUID();previewMessages.push({id:crypto.randomUUID(),role:"user",content:text,createdAt:new Date().toISOString(),taskId:id});previewTasks=[{id,type:"assistant-chat",status:"running",input:{text},createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),progressText:"",statusMessage:"Consultando contexto local…",statusHistory:["Solicitação interpretada","Consultando contexto local…"]}];window.setTimeout(()=>{if(!previewTasks.length)return;previewTasks[0].progressText="### Análise\n\nEncontrei **3 pontos importantes**:\n\n1. Estrutura local validada\n2. Contexto protegido\n3. Resposta em Markdown\n\n```ts\nconst nexo = { status: 'pronto' };\n```";},500);window.setTimeout(()=>{if(!previewTasks.length)return;previewMessages.push({id:crypto.randomUUID(),role:"assistant",content:previewTasks[0].progressText,createdAt:new Date().toISOString(),taskId:id});previewTasks=[];},2300);return previewTasks[0];},cancelTask:async()=>{previewTasks=[];return true;},chooseDocument:async()=>null,
    getSettings:async()=>settings,updateSettings:async(patch:object)=>Object.assign(settings,patch),status:async()=>({llm:{ok:true,detail:"Prévia local"},models:[settings.model],settings,tools:[]}),openExternal:async()=>undefined
  }});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
