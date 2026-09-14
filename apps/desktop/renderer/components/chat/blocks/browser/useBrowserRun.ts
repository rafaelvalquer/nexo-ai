import { useEffect,useMemo } from "react";
import type { BrowserRunEvent } from "@nexo/shared/browser-agent";
import { ensureBrowserRunEvents,useBrowserRunsStore } from "../../../../stores/browser-runs";

export function useBrowserRun(runId:string){
  const run=useBrowserRunsStore(state=>state.runs[runId]);
  const liveEvents=useBrowserRunsStore(state=>state.events[runId]??[]);
  const history=useBrowserRunsStore(state=>state.history[runId]??[]);
  const load=useBrowserRunsStore(state=>state.load);
  useEffect(()=>{ensureBrowserRunEvents();void load(runId);},[load,runId]);
  const approval=useMemo(()=>[...liveEvents].reverse().find((event):event is Extract<BrowserRunEvent,{type:"browser.approval_requested"}>=>event.type==="browser.approval_requested"),[liveEvents]);
  return{run,liveEvents,history,approval,reload:()=>load(runId)};
}
