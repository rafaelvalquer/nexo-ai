import type {
  ConversationPageOptions, ConversationMessagePage, ChatActionRequest, ChatActionOutcome, ChatResourceUpdatedEvent, ClarificationResolutionRequest,
  CreateAutomationV2Input, UpdateAutomationV2Input, AutomationExecutionResult, AutomationViewModel,
  CreateMacroInput, UpdateMacroInput, MacroExecutionResult, MacroView, MacroRun, MacroPreset,
  EmailComposeDraftUpdateRequest, EmailComposeDraftCancelRequest, EmailComposeDraftSubmitRequest
} from "@nexo/shared";
import type { BrowserAgentControl, BrowserFrame, BrowserRunEvent } from "@nexo/shared/browser-agent";
import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("nexoOllama", {
  pull:(model:string)=>ipcRenderer.invoke("nexo:ollama:pull",model),
  onProgress:(callback:(event:unknown)=>void)=>{const listener=(_event:unknown,payload:unknown)=>callback(payload);ipcRenderer.on("nexo:ollama:pull-progress",listener);return()=>ipcRenderer.removeListener("nexo:ollama:pull-progress",listener);}
});

const frameListeners = new Map<string,Set<(frame:BrowserFrame)=>void>>();
const framePorts = new Map<string,MessagePort>();
ipcRenderer.on("nexo:browser-agent:frame-port", (event, payload:{runId:string}) => {
  const port = (event as unknown as {ports?:MessagePort[]}).ports?.[0];
  if (!port || !payload?.runId) return;
  framePorts.get(payload.runId)?.close();
  framePorts.set(payload.runId, port);
  port.onmessage = message => {
    const raw = message.data as BrowserFrame;
    const bytes = raw.bytes instanceof Uint8Array ? raw.bytes : new Uint8Array(raw.bytes as unknown as ArrayBuffer);
    const frame = {...raw, bytes};
    for (const listener of frameListeners.get(payload.runId) ?? []) listener(frame);
  };
  port.start();
});

const legacyStart=(text:string,attachments:string[])=>(ipcRenderer.invoke("nexo:conversations:list") as Promise<Array<{id:string}>>).then(async conversations=>{const conversation=conversations[0]??await ipcRenderer.invoke("nexo:conversations:create");return ipcRenderer.invoke("nexo:chat:start",conversation.id,text,attachments);});
const api={
  dashboard:{
    getCatalog:()=>ipcRenderer.invoke("nexo:dashboard:catalog"),getLayout:()=>ipcRenderer.invoke("nexo:dashboard:layout"),
    addGadget:(id:string,configuration:Record<string,unknown>={},size?:string)=>ipcRenderer.invoke("nexo:dashboard:add",id,configuration,size),
    removeGadget:(instanceId:string)=>ipcRenderer.invoke("nexo:dashboard:remove",instanceId),
    configureGadget:(instanceId:string,configuration:Record<string,unknown>,size?:string)=>ipcRenderer.invoke("nexo:dashboard:configure",instanceId,configuration,size),
    saveLayout:(items:Array<{instanceId:string;size:string;position:number}>)=>ipcRenderer.invoke("nexo:dashboard:save-layout",items),
    getGadgetData:(id:string,configuration:Record<string,unknown>={})=>ipcRenderer.invoke("nexo:dashboard:data",id,configuration),
    refreshGadget:(id:string,configuration:Record<string,unknown>={})=>ipcRenderer.invoke("nexo:dashboard:refresh",id,configuration),
    getEmailMessage:(connectionId:string,messageId:string)=>ipcRenderer.invoke("nexo:dashboard:email-message",connectionId,messageId),
    replyEmail:(input:{connectionId:string;messageId:string;threadId?:string;bodyText:string})=>ipcRenderer.invoke("nexo:dashboard:email-reply",input),
    trashEmail:(input:{connectionId:string;messageId:string})=>ipcRenderer.invoke("nexo:dashboard:email-trash",input)
  },
  loadMoreChatBlock:(conversationId:string,messageId:string,blockId:string)=>ipcRenderer.invoke("nexo:chat:more",conversationId,messageId,blockId),
  executeChatAction:(request:ChatActionRequest):Promise<ChatActionOutcome>=>ipcRenderer.invoke("nexo:chat:action",request),
  resolveInlineApproval:(conversationId:string,messageId:string,approvalId:string,approved:boolean)=>ipcRenderer.invoke("nexo:chat:approval",conversationId,messageId,approvalId,approved),
  resolveClarification:(request:ClarificationResolutionRequest)=>ipcRenderer.invoke("nexo:clarification:resolve",request),
  cancelClarification:(clarificationId:string)=>ipcRenderer.invoke("nexo:clarification:cancel",clarificationId),
  getPendingClarification:(conversationId:string)=>ipcRenderer.invoke("nexo:clarification:get-pending",conversationId),
  getEmailDraft:(draftId:string)=>ipcRenderer.invoke("nexo:email-draft:get",draftId),
  updateEmailDraft:(request:EmailComposeDraftUpdateRequest)=>ipcRenderer.invoke("nexo:email-draft:update",request),
  cancelEmailDraft:(request:EmailComposeDraftCancelRequest)=>ipcRenderer.invoke("nexo:email-draft:cancel",request),
  submitEmailDraft:(request:EmailComposeDraftSubmitRequest)=>ipcRenderer.invoke("nexo:email-draft:submit",request),
  onChatResourceUpdated:(callback:(event:ChatResourceUpdatedEvent)=>void)=>{const listener=(_event:unknown,event:ChatResourceUpdatedEvent)=>callback(event);ipcRenderer.on("nexo:chat:resource",listener);return()=>{ipcRenderer.removeListener("nexo:chat:resource",listener);};},
  onTaskEvent:(callback:(event:unknown)=>void)=>{const listener=(_event:unknown,payload:unknown)=>callback(payload);ipcRenderer.on("nexo:task:event",listener);return()=>{ipcRenderer.removeListener("nexo:task:event",listener);};},
  onVisualEvent:(callback:(event:unknown)=>void)=>{const listener=(_event:unknown,payload:unknown)=>callback(payload);ipcRenderer.on("nexo:visual:event",listener);return()=>{ipcRenderer.removeListener("nexo:visual:event",listener);};},
  getVisualSnapshot:()=>ipcRenderer.invoke("nexo:visual:snapshot"),
  chat:(text:string)=>ipcRenderer.invoke("nexo:chat",text),
  listConversations:()=>ipcRenderer.invoke("nexo:conversations:list"),
  createConversation:(title?:string)=>ipcRenderer.invoke("nexo:conversations:create",title),
  renameConversation:(id:string,title:string)=>ipcRenderer.invoke("nexo:conversations:rename",id,title),
  deleteConversation:(id:string)=>ipcRenderer.invoke("nexo:conversations:delete",id),
  conversationMessagePage:(id:string,options:ConversationPageOptions={}):Promise<ConversationMessagePage>=>ipcRenderer.invoke("nexo:conversations:messages-page",id,options),
  conversationMessages:(id:string)=>ipcRenderer.invoke("nexo:conversations:messages",id),
  startChatTask:(conversationOrText:string,textOrAttachments?:string|string[],attachmentIds:string[]=[])=>typeof textOrAttachments==="string"?ipcRenderer.invoke("nexo:chat:start",conversationOrText,textOrAttachments,attachmentIds):legacyStart(conversationOrText,Array.isArray(textOrAttachments)?textOrAttachments:[]),
  listConnections:()=>ipcRenderer.invoke("nexo:connections:list"),
  getConnectionConfiguration:()=>ipcRenderer.invoke("nexo:connections:configuration"),
  saveConnectionConfiguration:(configuration:{googleClientId:string;googleClientSecret?:string;microsoftClientId:string;microsoftTenant:string})=>ipcRenderer.invoke("nexo:connections:save-configuration",configuration),
  deleteGoogleClientSecret:()=>ipcRenderer.invoke("nexo:connections:delete-google-secret"),
  connect:(provider:"google"|"microsoft",capabilities:string[])=>ipcRenderer.invoke("nexo:connections:connect",provider,capabilities),
  disconnect:(id:string)=>ipcRenderer.invoke("nexo:connections:disconnect",id),
  testConnection:(id:string)=>ipcRenderer.invoke("nexo:connections:test",id),
  addConnectionCapabilities:(id:string,capabilities:string[])=>ipcRenderer.invoke("nexo:connections:add-capabilities",id,capabilities),
  setConnectionCapabilities:(id:string,capabilities:string[])=>ipcRenderer.invoke("nexo:connections:set-capabilities",id,capabilities),
  connectionDiagnostics:(id:string)=>ipcRenderer.invoke("nexo:connections:diagnostics",id),
  getEmailSearchPreferences:(id:string)=>ipcRenderer.invoke("nexo:connections:email-preferences:get",id),
  saveEmailSearchPreferences:(id:string,categories:string[])=>ipcRenderer.invoke("nexo:connections:email-preferences:save",id,categories),
  chooseDocument:()=>ipcRenderer.invoke("nexo:documents:choose"),
  importDroppedDocument:(file:File)=>ipcRenderer.invoke("nexo:documents:import-dropped",webUtils.getPathForFile(file)),
  listRecentDocuments:()=>ipcRenderer.invoke("nexo:documents:list-recent"),
  getDocument:(id:string)=>ipcRenderer.invoke("nexo:documents:get",id),
  listDocumentVersions:(id:string)=>ipcRenderer.invoke("nexo:documents:list-versions",id),
  previewDocument:(id:string)=>ipcRenderer.invoke("nexo:documents:preview",id),
  documentPreviewData:(id:string)=>ipcRenderer.invoke("nexo:documents:preview-data",id),
  exportDocument:(id:string)=>ipcRenderer.invoke("nexo:documents:export",id),
  editDocument:(id:string,plan:unknown)=>ipcRenderer.invoke("nexo:documents:edit",id,plan),
  chatHistory:()=>ipcRenderer.invoke("nexo:chat:history"),
  listTasks:(limit=50)=>ipcRenderer.invoke("nexo:tasks:list",limit),
  listActiveTasks:()=>ipcRenderer.invoke("nexo:tasks:active"),
  getTask:(id:string)=>ipcRenderer.invoke("nexo:task:get",id),
  cancelTask:(id:string)=>ipcRenderer.invoke("nexo:task:cancel",id),
  status:()=>ipcRenderer.invoke("nexo:status"),
  recordMetric:(metric:string,value:number,tags:Record<string,string|number|boolean>={})=>ipcRenderer.invoke("nexo:metrics:record",metric,value,tags),
  getSettings:()=>ipcRenderer.invoke("nexo:settings:get"),
  updateSettings:(patch:any)=>ipcRenderer.invoke("nexo:settings:update",patch),
  listApprovals:()=>ipcRenderer.invoke("nexo:approvals:list"),
  resolveApproval:(id:string,approved:boolean)=>ipcRenderer.invoke("nexo:approvals:resolve",id,approved),
  listAudit:()=>ipcRenderer.invoke("nexo:audit:list"),
  listMemories:()=>ipcRenderer.invoke("nexo:memory:list"),
  addMemory:(key:string,value:string,category?:string)=>ipcRenderer.invoke("nexo:memory:add",key,value,category),
  searchMemory:(query:string)=>ipcRenderer.invoke("nexo:memory:search",query),
  removeMemory:(key:string)=>ipcRenderer.invoke("nexo:memory:remove",key),
  clearMemory:()=>ipcRenderer.invoke("nexo:memory:clear"),
  clearIntentLearning:()=>ipcRenderer.invoke("nexo:intent-learning:clear"),
  intentLearningCount:()=>ipcRenderer.invoke("nexo:intent-learning:count"),
  listAutomations:()=>ipcRenderer.invoke("nexo:automation:list"),
  getAutomation:(id:string)=>ipcRenderer.invoke("nexo:automation:get",id),
  createAutomation:(data:any)=>ipcRenderer.invoke("nexo:automation:create",data),
  createAutomationV2:(data:CreateAutomationV2Input)=>ipcRenderer.invoke("nexo:automation:create-v2",data),
  draftMacroFromNatural:(data:{name?:string;description:string})=>ipcRenderer.invoke("nexo:automation:draft-natural",data),
  createNaturalAutomation:(data:{name:string;when:string;command:string;enabled?:boolean})=>ipcRenderer.invoke("nexo:automation:create-natural",data),
  updateAutomation:(id:string,data:UpdateAutomationV2Input)=>ipcRenderer.invoke("nexo:automation:update",id,data),
  duplicateAutomation:(id:string)=>ipcRenderer.invoke("nexo:automation:duplicate",id),
  toggleAutomation:(id:string,enabled:boolean)=>ipcRenderer.invoke("nexo:automation:toggle",id,enabled),
  removeAutomation:(id:string)=>ipcRenderer.invoke("nexo:automation:remove",id),
  runAutomation:(id:string):Promise<AutomationExecutionResult|AutomationViewModel>=>ipcRenderer.invoke("nexo:automation:run",id),
  cancelAutomation:(id:string):Promise<boolean>=>ipcRenderer.invoke("nexo:automation:cancel",id),
  resumeAutomationRun:(runId:string,mode:"retry"|"continue")=>ipcRenderer.invoke("nexo:automation:resume-run",runId,mode),
  testAutomation:(id:string)=>ipcRenderer.invoke("nexo:automation:test",id),
  testAutomationDraft:(data:CreateAutomationV2Input)=>ipcRenderer.invoke("nexo:automation:test-draft",data),
  listAutomationRuns:(id:string,limit=50)=>ipcRenderer.invoke("nexo:automation:runs",id,limit),
  getAutomationRun:(id:string)=>ipcRenderer.invoke("nexo:automation:run-get",id),
  listAutomationPresets:()=>ipcRenderer.invoke("nexo:automation:presets"),
  listAutomationActions:()=>ipcRenderer.invoke("nexo:automation:action-catalog"),
  listAutomationTriggers:()=>ipcRenderer.invoke("nexo:automation:trigger-catalog"),
  listMacros:():Promise<MacroView[]>=>ipcRenderer.invoke("nexo:macro:list"),
  getMacro:(id:string):Promise<MacroView|undefined>=>ipcRenderer.invoke("nexo:macro:get",id),
  createMacro:(data:CreateMacroInput):Promise<MacroView>=>ipcRenderer.invoke("nexo:macro:create",data),
  createNaturalMacro:(data:{name:string;when:string;command:string;enabled?:boolean}):Promise<MacroView>=>ipcRenderer.invoke("nexo:macro:create-natural",data),
  draftMacro:(data:{name?:string;description:string})=>ipcRenderer.invoke("nexo:macro:draft-natural",data),
  updateMacro:(id:string,data:UpdateMacroInput):Promise<MacroView>=>ipcRenderer.invoke("nexo:macro:update",id,data),
  duplicateMacro:(id:string):Promise<MacroView>=>ipcRenderer.invoke("nexo:macro:duplicate",id),
  setMacroEnabled:(id:string,enabled:boolean):Promise<MacroView>=>ipcRenderer.invoke("nexo:macro:set-enabled",id,enabled),
  removeMacro:(id:string):Promise<void>=>ipcRenderer.invoke("nexo:macro:remove",id),
  runMacro:(id:string):Promise<MacroExecutionResult|MacroView>=>ipcRenderer.invoke("nexo:macro:run",id),
  cancelMacro:(id:string):Promise<boolean>=>ipcRenderer.invoke("nexo:macro:cancel",id),
  resumeMacroRun:(runId:string,mode:"retry"|"continue"):Promise<MacroRun>=>ipcRenderer.invoke("nexo:macro:resume-run",runId,mode),
  testMacro:(id:string):Promise<MacroRun|undefined>=>ipcRenderer.invoke("nexo:macro:test",id),
  testMacroDraft:(data:CreateMacroInput):Promise<MacroRun|undefined>=>ipcRenderer.invoke("nexo:macro:test-draft",data),
  listMacroRuns:(id:string,limit=50):Promise<MacroRun[]>=>ipcRenderer.invoke("nexo:macro:runs",id,limit),
  getMacroRun:(id:string):Promise<MacroRun|undefined>=>ipcRenderer.invoke("nexo:macro:run-get",id),
  listMacroPresets:():Promise<MacroPreset[]>=>ipcRenderer.invoke("nexo:macro:presets"),
  listMacroActions:()=>ipcRenderer.invoke("nexo:macro:action-catalog"),
  listMacroTriggers:()=>ipcRenderer.invoke("nexo:macro:trigger-catalog"),
  chooseFolder:()=>ipcRenderer.invoke("nexo:choose-folder"),
  openPath:(path:string)=>ipcRenderer.invoke("nexo:open-path",path),
  openExternal:(url:string)=>ipcRenderer.invoke("nexo:open-external",url),
  trashItem:(path:string)=>ipcRenderer.invoke("nexo:trash-item",path),
  backup:()=>ipcRenderer.invoke("nexo:backup"),
  getBrowserRun:(runId:string)=>ipcRenderer.invoke("nexo:browser-agent:get",runId),
  listBrowserRuns:(conversationId?:string)=>ipcRenderer.invoke("nexo:browser-agent:list",conversationId),
  getBrowserRunEvents:(runId:string)=>ipcRenderer.invoke("nexo:browser-agent:events",runId),
  controlBrowserRun:(control:BrowserAgentControl)=>ipcRenderer.invoke("nexo:browser-agent:control",control),
  resolveBrowserApproval:(approvalId:string,approved:boolean)=>ipcRenderer.invoke("nexo:browser-agent:approval",approvalId,approved),
  openBrowserRun:(runId:string)=>ipcRenderer.invoke("nexo:browser-agent:open",runId),
  getBrowserPersonalProfileEnabled:()=>ipcRenderer.invoke("nexo:browser-agent:personal-profile:get"),
  setBrowserPersonalProfileEnabled:(enabled:boolean)=>ipcRenderer.invoke("nexo:browser-agent:personal-profile:set",enabled),
  onBrowserRunEvent:(callback:(event:BrowserRunEvent)=>void)=>{const listener=(_event:unknown,payload:BrowserRunEvent)=>callback(payload);ipcRenderer.on("nexo:browser-agent:event",listener);return()=>ipcRenderer.removeListener("nexo:browser-agent:event",listener);},
  subscribeBrowserFrames:(runId:string,callback:(frame:BrowserFrame)=>void)=>{
    const listeners=frameListeners.get(runId)??new Set<(frame:BrowserFrame)=>void>();
    listeners.add(callback);frameListeners.set(runId,listeners);
    if(listeners.size===1)void ipcRenderer.invoke("nexo:browser-agent:subscribe-frames",runId);
    return()=>{const current=frameListeners.get(runId);current?.delete(callback);if(!current?.size){frameListeners.delete(runId);framePorts.get(runId)?.close();framePorts.delete(runId);void ipcRenderer.invoke("nexo:browser-agent:unsubscribe-frames",runId);}};
  }
};
contextBridge.exposeInMainWorld("nexo",api);
export type NexoDesktopApi=typeof api;
