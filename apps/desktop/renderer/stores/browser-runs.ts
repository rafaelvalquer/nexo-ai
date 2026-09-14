import { create } from "zustand";
import type { BrowserRun, BrowserRunEvent } from "@nexo/shared/browser-agent";

export type StoredEvent={id:string;browser_run_id:string;type:string;label:string|null;url:string|null;created_at:string};
export type BrowserRunState={
  runs:Record<string,BrowserRun>;
  events:Record<string,BrowserRunEvent[]>;
  history:Record<string,StoredEvent[]>;
  load:(runId:string)=>Promise<void>;
  handleEvent:(event:BrowserRunEvent)=>void;
  control:(runId:string,action:"pause"|"resume"|"cancel",instruction?:string)=>Promise<void>;
  steer:(runId:string,instruction:string)=>Promise<void>;
  resolveApproval:(approvalId:string,approved:boolean)=>Promise<void>;
};

// Zustand 5 uses useSyncExternalStore under the hood. A selector must return the
// same reference while the underlying state is unchanged. Never use `?? []`
// directly inside a selector: that creates a new snapshot on every read and can
// trigger React's "Maximum update depth exceeded" protection.
const EMPTY_BROWSER_RUN_EVENTS:BrowserRunEvent[]=[];
const EMPTY_BROWSER_RUN_HISTORY:StoredEvent[]=[];

export function selectBrowserRunEvents(state:Pick<BrowserRunState,"events">,runId:string){
  return state.events[runId]??EMPTY_BROWSER_RUN_EVENTS;
}

export function selectBrowserRunHistory(state:Pick<BrowserRunState,"history">,runId:string){
  return state.history[runId]??EMPTY_BROWSER_RUN_HISTORY;
}

function applyEvent(run:BrowserRun,event:BrowserRunEvent):BrowserRun{
  switch(event.type){
    case "browser.navigation":return{...run,currentUrl:event.url,pageTitle:event.title};
    case "browser.step":return{...run,currentStep:event.label,stepCount:Math.max(run.stepCount,event.step)};
    case "browser.status":return{...run,status:event.status};
    case "browser.approval_requested":return{...run,status:"waiting_approval"};
    case "browser.completed":return{...run,status:"completed",finishedAt:event.timestamp,finalResult:event.result??run.finalResult};
    case "browser.failed":return{...run,status:"failed",error:event.error,finishedAt:event.timestamp};
    case "browser.cancelled":return{...run,status:"cancelled",finishedAt:event.timestamp};
    default:return run;
  }
}

export const useBrowserRunsStore=create<BrowserRunState>((set,get)=>({
  runs:{},events:{},history:{},
  load:async runId=>{
    const [run,history]=await Promise.all([window.nexo.getBrowserRun(runId),window.nexo.getBrowserRunEvents(runId)]) as [BrowserRun|undefined,StoredEvent[]];
    if(run)set(state=>({runs:{...state.runs,[runId]:run},history:{...state.history,[runId]:history??[]}}));
  },
  handleEvent:event=>set(state=>{
    const existing=state.runs[event.runId];
    const events=[...(state.events[event.runId]??[]),event].slice(-80);
    return{events:{...state.events,[event.runId]:events},runs:existing?{...state.runs,[event.runId]:applyEvent(existing,event)}:state.runs};
  }),
  control:async(runId,action)=>{await window.nexo.controlBrowserRun({runId,action} as any);await get().load(runId);},
  steer:async(runId,instruction)=>{const value=instruction.trim();if(!value)return;await window.nexo.controlBrowserRun({runId,action:"steer",instruction:value});},
  resolveApproval:async(approvalId,approved)=>{const run=await window.nexo.resolveBrowserApproval(approvalId,approved) as BrowserRun|undefined;if(run)set(state=>({runs:{...state.runs,[run.id]:run}}));}
}));

let subscribed=false;
export function ensureBrowserRunEvents(){
  if(subscribed)return;
  subscribed=true;
  window.nexo.onBrowserRunEvent(event=>useBrowserRunsStore.getState().handleEvent(event));
}
