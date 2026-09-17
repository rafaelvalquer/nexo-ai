import type { ChatActionRequest, ChatActionOutcome, ChatBlock, ChatResourceUpdatedEvent, ConversationCursor, ConversationMessagePage } from "@nexo/shared";
import { create } from "zustand";
import type { BackgroundTask,ChatMessage,ConversationSummary,DocumentRecord,ChatSessionStatus } from "@nexo/shared";
export const MAX_CHAT_SESSIONS=4;
export type AssistantAttachment={taskId:string;name:string;status:"indexing"|"ready"|"failed";documentId?:string};
export type ChatSessionState={id:string;title:string;createdAt:string;updatedAt:string;messages:ChatMessage[];attachments:AssistantAttachment[];activeTaskId?:string;agentId?:string;runId?:string;status:ChatSessionStatus;hasMoreHistory?:boolean;historyCursor?:ConversationCursor;historyLoading?:boolean;historyError?:string;historyRevision?:number};
type TaskEvent={kind:string;taskId:string;task?:BackgroundTask;token?:string};
type Store={
loadOlderMessages:(id:string)=>Promise<void>;
blockLimits:Record<string,number>;
executeResourceAction:(request:ChatActionRequest)=>Promise<ChatActionOutcome>;
resolveInlineApproval:(conversationId:string,messageId:string,approvalId:string,approved:boolean)=>Promise<void>;
loadMoreBlock:(conversationId:string,messageId:string,blockId:string)=>Promise<void>;
updateMessageBlock:(conversationId:string,messageId:string,block:ChatBlock)=>void;
handleResourceEvent:(event:ChatResourceUpdatedEvent)=>void;
sessions:ChatSessionState[];activeSessionId:string;tasks:BackgroundTask[];error:string|null;isFollowing:boolean;sync:()=>Promise<void>;syncSession:(id:string)=>Promise<void>;createSession:()=>Promise<string|undefined>;closeSession:(id:string)=>Promise<boolean>;renameSession:(id:string,title:string)=>Promise<void>;selectSession:(id:string)=>void;isStreaming:(id:string)=>boolean;handleTaskEvent:(event:unknown)=>void;syncAttachments:(sessionId?:string)=>Promise<void>;send:(sessionId:string,text:string)=>Promise<boolean>;cancel:(sessionId:string)=>Promise<void>;attach:(sessionId:string)=>Promise<void>;attachDocument:(sessionId:string,document:DocumentRecord)=>void;removeAttachment:(sessionId:string,id:string)=>void;setFollowing:(value:boolean)=>void};
const taskStatus=(task?:BackgroundTask):ChatSessionStatus=>task?.status==="waiting_approval"?"waiting_approval":task?.status==="waiting_review"?"waiting_review":task?.status==="running"||task?.status==="queued"?"running":task?.status==="failed"?"failed":task?.status==="completed"?"completed":"idle";
const buildSession=(conversation:ConversationSummary,messages:ChatMessage[],tasks:BackgroundTask[],existing?:ChatSessionState):ChatSessionState=>{const candidates=tasks.filter(task=>task.type==="assistant-chat"&&task.conversationId===conversation.id&&["queued","running","waiting_review","waiting_approval"].includes(task.status)),active=candidates.find(task=>task.status!=="waiting_review")??candidates.at(-1);return{...existing,id:conversation.id,title:conversation.title,createdAt:conversation.createdAt,updatedAt:conversation.updatedAt,messages,attachments:existing?.attachments??[],activeTaskId:active?.id,agentId:active?.agentId??existing?.agentId,runId:active?.runId??existing?.runId,status:taskStatus(active)};};
const historyQueues = new Map<string, Promise<void>>();
const historyVersions = new Map<string, number>();
const closedSessions = new Set<string>();
let syncInFlight: Promise<void> | undefined;
let taskVersion = 0;
const invalidateHistory = (id:string) => historyVersions.set(id,(historyVersions.get(id)??0)+1);
const compareMessages = (a:ChatMessage,b:ChatMessage) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const mergeMessages = (existing:ChatMessage[],incoming:ChatMessage[]) => [...new Map([...existing,...incoming].map(message=>[message.id,message])).values()].sort(compareMessages);
function serializeHistory(id:string,work:()=>Promise<void>) {
  const result = (historyQueues.get(id)??Promise.resolve()).catch(()=>undefined).then(work);
  historyQueues.set(id,result);
  const cleanup = () => {if(historyQueues.get(id)===result)historyQueues.delete(id);};
  void result.then(cleanup,cleanup);
  return result;
}

export const useAssistantStore=create<Store>((set,get)=>({blockLimits:{},
  updateMessageBlock:(conversationId,messageId,block)=>{invalidateHistory(conversationId);set(state=>({sessions:state.sessions.map(session=>session.id!==conversationId?session:{...session,messages:session.messages.map(message=>message.id!==messageId?message:{...message,blocks:message.blocks?.some(value=>value.id===block.id)?message.blocks.map(value=>value.id===block.id?block:value):[...(message.blocks??[]),block]})})}));},
  handleResourceEvent:event=>{const message=get().sessions.find(session=>session.id===event.conversationId)?.messages.find(message=>message.id===event.messageId),block=message?.blocks?.find(block=>block.id===event.blockId);if(block?.type==="resource_collection")get().updateMessageBlock(event.conversationId,event.messageId,{...block,items:block.items.map(item=>item.id===event.itemId?event.item:item)});if(event.approval)get().updateMessageBlock(event.conversationId,event.messageId,event.approval);},
  executeResourceAction:async request=>{const result=await window.nexo.executeChatAction(request);if(result.item)get().handleResourceEvent({type:"chat.resource.updated",...request,state:result.item.state??"idle",item:result.item,approval:result.approval});if(result.block)get().updateMessageBlock(request.conversationId,request.messageId,result.block);if(result.copyText)await navigator.clipboard.writeText(result.copyText);return result;},
  resolveInlineApproval:async(conversationId,messageId,approvalId,approved)=>{try{const result=await window.nexo.resolveInlineApproval(conversationId,messageId,approvalId,approved);const message=get().sessions.find(session=>session.id===conversationId)?.messages.find(message=>message.id===messageId),block=message?.blocks?.find(block=>block.type==="approval"&&block.approvalId===approvalId);if(result?.approval)get().updateMessageBlock(conversationId,messageId,result.approval);else if(block?.type==="approval")get().updateMessageBlock(conversationId,messageId,{...block,status:approved?"approved":"rejected"});}catch(error){await get().syncSession(conversationId);throw error;}},
  loadMoreBlock:async(conversationId,messageId,blockId)=>{const block=get().sessions.find(session=>session.id===conversationId)?.messages.find(message=>message.id===messageId)?.blocks?.find(block=>block.id===blockId);if(block?.type!=="resource_collection")return;const limit=get().blockLimits[blockId]??8;if(limit>=block.items.length&&block.pagination?.hasMore){const next=await window.nexo.loadMoreChatBlock(conversationId,messageId,blockId);get().updateMessageBlock(conversationId,messageId,next);}set(state=>({blockLimits:{...state.blockLimits,[blockId]:limit+8}}));},
  sessions:[],activeSessionId:"",tasks:[],error:null,isFollowing:true,
  sync:()=>{
    if(syncInFlight)return syncInFlight;
    syncInFlight=(async()=>{
      try {
        let conversations=await window.nexo.listConversations() as ConversationSummary[];
        if(!conversations.length)conversations=[await window.nexo.createConversation() as ConversationSummary];
        const visible=conversations.filter(item=>!closedSessions.has(item.id)).slice(0,MAX_CHAT_SESSIONS);
        set(state=>{
          const sessions=visible.map(conversation=>state.sessions.find(item=>item.id===conversation.id)??buildSession(conversation,[],state.tasks));
          return {sessions,activeSessionId:sessions.some(item=>item.id===state.activeSessionId)?state.activeSessionId:sessions[0]?.id??""};
        });
        await Promise.all(visible.map(item=>get().syncSession(item.id)));
      } catch(error) {set({error:error instanceof Error?error.message:String(error)});}
    })().finally(()=>{syncInFlight=undefined;});
    return syncInFlight;
  },
  syncSession:id=>serializeHistory(id,async()=>{
    try {
      for(let attempt=0;attempt<3;attempt++) {
        const existing=get().sessions.find(item=>item.id===id);
        if(!existing||closedSessions.has(id))return;
        const version=historyVersions.get(id)??0, tasksVersion=taskVersion;
        const [conversations,first,tasks]=await Promise.all([window.nexo.listConversations() as Promise<ConversationSummary[]>,window.nexo.conversationMessagePage(id),window.nexo.listActiveTasks() as Promise<BackgroundTask[]>]);
        const conversation=conversations.find(item=>item.id===id);
        if(!conversation||closedSessions.has(id))return;
        const known=new Set(existing.messages.map(message=>message.id));
        let page:ConversationMessagePage=first, incoming=[...page.messages];
        // Recover all missing pages when more than one page arrived between synchronizations.
        while(known.size&&page.hasMore&&!page.messages.some(message=>known.has(message.id))){
          if((historyVersions.get(id)??0)!==version||closedSessions.has(id))break;
          page=await window.nexo.conversationMessagePage(id,{before:page.nextCursor});
          incoming=[...page.messages,...incoming];
        }
        if(closedSessions.has(id))return;
        if((historyVersions.get(id)??0)!==version)continue;
        set(state=>{
          const activeTasks=taskVersion===tasksVersion?tasks:state.tasks;
          return {tasks:activeTasks,error:null,sessions:state.sessions.map(current=>{
            if(current.id!==id)return current;
            // This query is authoritative from its oldest result through the newest message.
            // Preserve only the older pages outside that interval; removed messages must disappear.
            const retained=page.hasMore&&incoming.length?current.messages.filter(message=>compareMessages(message,incoming[0])<0):[];
            const keepCursor=retained.length>0;
            return {...buildSession(conversation,mergeMessages(retained,incoming),activeTasks,current),
              hasMoreHistory:keepCursor?current.hasMoreHistory:page.hasMore,historyCursor:keepCursor?current.historyCursor:page.nextCursor};
          })};
        });
        return;
      }
    } catch(error) {if(!closedSessions.has(id))set({error:error instanceof Error?error.message:String(error)});}
  }),
  loadOlderMessages:async id=>{
    const session=get().sessions.find(item=>item.id===id);
    if(!session?.hasMoreHistory||session.historyLoading)return;
    set(state=>({sessions:state.sessions.map(item=>item.id===id?{...item,historyLoading:true,historyError:undefined}:item)}));
    await serializeHistory(id,async()=>{
      try {
        for(let attempt=0;attempt<3;attempt++){
          const current=get().sessions.find(item=>item.id===id);
          if(!current?.historyCursor||closedSessions.has(id))return;
          const version=historyVersions.get(id)??0;
          const page=await window.nexo.conversationMessagePage(id,{before:current.historyCursor});
          if(closedSessions.has(id))return;
          if((historyVersions.get(id)??0)!==version)continue;
          set(state=>({sessions:state.sessions.map(item=>item.id===id?{...item,messages:mergeMessages(item.messages,page.messages),hasMoreHistory:page.hasMore,historyCursor:page.nextCursor,historyRevision:(item.historyRevision??0)+1}:item)}));
          return;
        }
        throw new Error("O histórico foi atualizado durante a consulta. Tente novamente.");
      } catch(error){if(!closedSessions.has(id))set(state=>({sessions:state.sessions.map(item=>item.id===id?{...item,historyError:error instanceof Error?error.message:String(error)}:item)}));}
      finally{set(state=>({sessions:state.sessions.map(item=>item.id===id?{...item,historyLoading:false}:item)}));}
    });
  },
  createSession:async()=>{if(get().sessions.length>=MAX_CHAT_SESSIONS){set({error:`Máximo de ${MAX_CHAT_SESSIONS} chats simultâneos.`});return;}try{const conversation=await window.nexo.createConversation() as ConversationSummary;set(state=>({sessions:[...state.sessions,{id:conversation.id,title:conversation.title,createdAt:conversation.createdAt,updatedAt:conversation.updatedAt,messages:[],attachments:[],status:"idle"}],activeSessionId:conversation.id,error:null}));return conversation.id;}catch(error){set({error:error instanceof Error?error.message:String(error)});}},
  closeSession:async id=>{const session=get().sessions.find(item=>item.id===id);if(!session||get().isStreaming(id)){set({error:"Pare a tarefa deste chat antes de fechá-lo."});return false;}try{closedSessions.add(id);invalidateHistory(id);await window.nexo.deleteConversation(id);set(state=>{const sessions=state.sessions.filter(item=>item.id!==id);return{sessions,activeSessionId:state.activeSessionId===id?sessions[0]?.id??"":state.activeSessionId,error:null};});if(!get().sessions.length)await get().createSession();return true;}catch(error){closedSessions.delete(id);set({error:error instanceof Error?error.message:String(error)});return false;}},
  renameSession:async(id,title)=>{try{const conversation=await window.nexo.renameConversation(id,title) as ConversationSummary;set(state=>({sessions:state.sessions.map(item=>item.id===id?{...item,title:conversation.title,updatedAt:conversation.updatedAt}:item)}));}catch(error){set({error:error instanceof Error?error.message:String(error)});}},
  selectSession:id=>set(state=>state.sessions.some(item=>item.id===id)?{activeSessionId:id}:{}),
  isStreaming:id=>{const session=get().sessions.find(item=>item.id===id);return Boolean(session?.activeTaskId&&["running","waiting_approval"].includes(session.status));},
  handleTaskEvent:value=>{if(!value||typeof value!=="object")return;const event=value as TaskEvent;if(typeof event.taskId!=="string")return;taskVersion++;if(event.task?.conversationId&&["completed","failed","cancelled"].includes(event.kind))invalidateHistory(event.task.conversationId);if(event.kind==="token"&&typeof event.token==="string"){set(state=>({tasks:state.tasks.map(task=>task.id===event.taskId?{...task,progressText:(task.progressText??"")+event.token}:task)}));return;}if(event.task){const conversationId=event.task.conversationId;if(conversationId&&!get().sessions.some(session=>session.id===conversationId))void get().sync();set(state=>{const active=["queued","running","waiting_review","waiting_approval"].includes(event.task!.status),tasks=active?[...state.tasks.filter(task=>task.id!==event.taskId),event.task!]:state.tasks.filter(task=>task.id!==event.taskId);return{tasks,sessions:state.sessions.map(session=>session.id===conversationId?{...session,activeTaskId:active?event.taskId:undefined,agentId:event.task!.agentId??session.agentId,runId:event.task!.runId??session.runId,status:taskStatus(event.task)}:session)};});}if(["completed","failed","cancelled"].includes(event.kind)){const id=event.task?.conversationId;if(id)void get().syncSession(id);else void get().sync();}},
  syncAttachments:async sessionId=>{const sessions=sessionId?get().sessions.filter(item=>item.id===sessionId):get().sessions,pending=sessions.flatMap(session=>session.attachments.filter(item=>item.status==="indexing").map(item=>({sessionId:session.id,item})));if(!pending.length)return;const tasks=(await Promise.all(pending.map(entry=>window.nexo.getTask(entry.item.taskId)))) as Array<BackgroundTask|undefined>;set(state=>({sessions:state.sessions.map(session=>({...session,attachments:session.attachments.map(item=>{const task=tasks.find((candidate:BackgroundTask|undefined)=>candidate?.id===item.taskId);if(task?.status==="completed"){const document=task.result as DocumentRecord;return{...item,name:document.name,status:"ready" as const,documentId:document.id};}return task?.status==="failed"?{...item,status:"failed" as const}:item;})}))}));},
  send:async(sessionId,text)=>{const value=text.trim(),state=get(),session=state.sessions.find(item=>item.id===sessionId);if(!session||!value||state.isStreaming(sessionId)||session.attachments.some(item=>item.status!=="ready"))return false;try{set({error:null});const task=await window.nexo.startChatTask(sessionId,value,session.attachments.flatMap(item=>item.documentId?[item.documentId]:[])) as BackgroundTask;set(current=>({sessions:current.sessions.map(item=>item.id===sessionId?{...item,attachments:[],activeTaskId:task.id,agentId:task.agentId,runId:task.runId,status:"running"}:item),tasks:[...current.tasks.filter(item=>item.id!==task.id),task]}));await get().syncSession(sessionId);return true;}catch(error){set({error:error instanceof Error?error.message:String(error)});return false;}},
  cancel:async sessionId=>{const session=get().sessions.find(item=>item.id===sessionId),task=session?.activeTaskId?get().tasks.find(item=>item.id===session.activeTaskId):undefined;if(!task)return;await window.nexo.cancelTask(task.id);await get().syncSession(sessionId);},
  attach:async sessionId=>{const task=await window.nexo.chooseDocument() as BackgroundTask|undefined;if(task)set(state=>({sessions:state.sessions.map(session=>session.id===sessionId?{...session,attachments:[...session.attachments,{taskId:task.id,name:"Documento selecionado",status:"indexing"}]}:session)}));},
  attachDocument:(sessionId,document)=>set(state=>({sessions:state.sessions.map(session=>{if(session.id!==sessionId||session.attachments.some(item=>item.documentId===document.id))return session;return{...session,attachments:[...session.attachments,{taskId:`document:${document.id}`,documentId:document.id,name:document.name,status:"ready"}]};})})),
  removeAttachment:(sessionId,id)=>set(state=>({sessions:state.sessions.map(session=>session.id===sessionId?{...session,attachments:session.attachments.filter(item=>item.taskId!==id)}:session)})),setFollowing:isFollowing=>set({isFollowing})
}));
