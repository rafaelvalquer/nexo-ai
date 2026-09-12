import { create } from "zustand";
import type { BackgroundTask, ChatMessage, DocumentRecord } from "@nexo/shared";
export type AssistantAttachment = { taskId:string; name:string; status:"indexing"|"ready"|"failed"; documentId?:string };
type Store = { messages:ChatMessage[]; tasks:BackgroundTask[]; attachments:AssistantAttachment[]; isStreaming:boolean; isFollowing:boolean; error:string|null; sync:()=>Promise<void>; syncAttachments:()=>Promise<void>; send:(text:string)=>Promise<boolean>; stop:()=>Promise<void>; attach:()=>Promise<void>; removeAttachment:(id:string)=>void; setFollowing:(value:boolean)=>void };
export const useAssistantStore=create<Store>((set,get)=>({
  messages:[],tasks:[],attachments:[],isStreaming:false,isFollowing:true,error:null,
  sync:async()=>{try{const [messages,tasks]=await Promise.all([window.nexo.chatHistory(),window.nexo.listActiveTasks()]);set({messages,tasks,isStreaming:tasks.some((task:BackgroundTask)=>task.type==="assistant-chat"),error:null});}catch(error){set({error:error instanceof Error?error.message:String(error)});}},
  syncAttachments:async()=>{const pending=get().attachments.filter(item=>item.status==="indexing");if(!pending.length)return;const tasks=await Promise.all(pending.map(item=>window.nexo.getTask(item.taskId)));set(state=>({attachments:state.attachments.map(item=>{const task=tasks.find(candidate=>candidate?.id===item.taskId);if(task?.status==="completed"){const document=task.result as DocumentRecord;return{...item,name:document.name,status:"ready" as const,documentId:document.id};}return task?.status==="failed"?{...item,status:"failed" as const}:item;})}));},
  send:async text=>{const value=text.trim(),state=get();if(!value||state.isStreaming||state.attachments.some(item=>item.status!=="ready"))return false;try{set({isStreaming:true,error:null});await window.nexo.startChatTask(value,state.attachments.flatMap(item=>item.documentId?[item.documentId]:[]));set({attachments:[]});await get().sync();return true;}catch(error){set({isStreaming:false,error:error instanceof Error?error.message:String(error)});return false;}},
  stop:async()=>{const task=get().tasks.find(item=>item.type==="assistant-chat");if(!task)return;await window.nexo.cancelTask(task.id);await get().sync();},
  attach:async()=>{const task=await window.nexo.chooseDocument();if(task)set(state=>({attachments:[...state.attachments,{taskId:task.id,name:"Documento selecionado",status:"indexing"}]}));},
  removeAttachment:id=>set(state=>({attachments:state.attachments.filter(item=>item.taskId!==id)})),setFollowing:isFollowing=>set({isFollowing})
}));
