import { useCallback,useLayoutEffect,useRef,useState,type RefObject } from "react";
import { useReducedMotion } from "motion/react";

type ChatAutoScrollOptions={
  sessionId?:string;
  messageCount:number;
  newestMessageId?:string;
  historyRevision?:number;
  historyLoading?:boolean;
  streaming:boolean;
  streamRevision?:string|number;
  pendingApprovalId?:string;
};

const NEAR_BOTTOM_THRESHOLD=120;

function isNearBottom(node:HTMLDivElement){
  return node.scrollHeight-node.scrollTop-node.clientHeight<=NEAR_BOTTOM_THRESHOLD;
}

export function useChatAutoScroll(ref:RefObject<HTMLDivElement>,options:ChatAutoScrollOptions){
  const{sessionId,messageCount,streaming,streamRevision=0,pendingApprovalId,newestMessageId,historyRevision=0,historyLoading=false}=options;
  const reduceMotion=useReducedMotion();
  const[nearBottom,setNearBottom]=useState(true),[unread,setUnread]=useState(false);
  const followRef=useRef(true);
  const anchoringRef=useRef(false);
  const programmaticRef=useRef(false);
  const programmaticTimerRef=useRef<number>();
  const pendingInitialScrollRef=useRef(true);
  const previousSessionRef=useRef<string>();
  const previousMessageCountRef=useRef(0);
  const previousNewestRef=useRef<string>();
  const previousHistoryRevisionRef=useRef(historyRevision);
  const historyAnchorRef=useRef<{sessionId?:string;id:string;offset:number}>();
  const captureHistoryAnchor=useCallback(()=>{
    const node=ref.current;
    if(!node)return;
    const viewport=node.getBoundingClientRect();
    const visible=[...node.querySelectorAll<HTMLElement>("[data-message-id]")].find(message=>message.getBoundingClientRect().bottom>viewport.top);
    if(visible)historyAnchorRef.current={sessionId,id:visible.dataset.messageId!,offset:visible.getBoundingClientRect().top-viewport.top};
  },[ref,sessionId]);
  const previousStreamRevisionRef=useRef<string|number>(streamRevision);
  const previousApprovalIdRef=useRef<string>();
  const currentSessionRef=useRef(sessionId);
  const scheduledFrameRef=useRef<number>();
  const scheduledSecondFrameRef=useRef<number>();
  currentSessionRef.current=sessionId;

  const cancelScheduledScroll=useCallback(()=>{
    if(scheduledFrameRef.current!==undefined)cancelAnimationFrame(scheduledFrameRef.current);
    if(scheduledSecondFrameRef.current!==undefined)cancelAnimationFrame(scheduledSecondFrameRef.current);
    scheduledFrameRef.current=undefined;
    scheduledSecondFrameRef.current=undefined;
  },[]);

  const markProgrammaticScroll=useCallback((behavior:ScrollBehavior)=>{
    programmaticRef.current=true;
    if(programmaticTimerRef.current!==undefined)window.clearTimeout(programmaticTimerRef.current);
    programmaticTimerRef.current=window.setTimeout(()=>{programmaticRef.current=false;},behavior==="smooth"?500:0);
  },[]);

  const scrollToBottom=useCallback((behavior:ScrollBehavior="smooth")=>{
    const resolvedBehavior=reduceMotion?"auto":behavior;
    const node=ref.current;
    followRef.current=true;
    pendingInitialScrollRef.current=false;
    if(node){
      markProgrammaticScroll(resolvedBehavior);
      node.scrollTo({top:node.scrollHeight,behavior:resolvedBehavior});
    }
    setNearBottom(true);
    setUnread(false);
  },[markProgrammaticScroll,ref,reduceMotion]);

  const scheduleBottom=useCallback((behavior:ScrollBehavior,settleLayout:boolean,respectFollow:boolean)=>{
    cancelScheduledScroll();
    const expectedSession=currentSessionRef.current;
    const run=()=>{
      scheduledSecondFrameRef.current=undefined;
      if(currentSessionRef.current!==expectedSession)return;
      if(respectFollow&&!followRef.current)return;
      scrollToBottom(behavior);
    };
    scheduledFrameRef.current=requestAnimationFrame(()=>{
      scheduledFrameRef.current=undefined;
      if(settleLayout)scheduledSecondFrameRef.current=requestAnimationFrame(run);
      else run();
    });
  },[cancelScheduledScroll,scrollToBottom]);

  const anchorLatestUser=useCallback((behavior:ScrollBehavior="smooth")=>{
    const resolvedBehavior=reduceMotion?"auto":behavior;
    const node=ref.current;
    if(!node)return;
    const messages=node.querySelectorAll<HTMLElement>(".chatMessage.user");
    const latest=messages.item(messages.length-1);
    if(!latest)return;
    followRef.current=false;
    pendingInitialScrollRef.current=false;
    anchoringRef.current=true;
    const viewport=node.getBoundingClientRect();
    const message=latest.getBoundingClientRect();
    const top=Math.max(0,node.scrollTop+(message.top-viewport.top)-14);
    markProgrammaticScroll(resolvedBehavior);
    node.scrollTo({top,behavior:resolvedBehavior});
    setUnread(false);
    window.setTimeout(()=>{anchoringRef.current=false;},resolvedBehavior==="smooth"?400:0);
  },[markProgrammaticScroll,ref,reduceMotion]);

  const prepareHistoryLoad=useCallback(()=>{
    cancelScheduledScroll();
    followRef.current=false;
    captureHistoryAnchor();
  },[cancelScheduledScroll,captureHistoryAnchor]);

  const onScroll=useCallback(()=>{
    const node=ref.current;
    if(!node)return;
    if(historyAnchorRef.current)captureHistoryAnchor();
    const near=isNearBottom(node);
    setNearBottom(near);
    if(anchoringRef.current)return;
    if(programmaticRef.current){
      if(near)setUnread(false);
      return;
    }
    followRef.current=near;
    if(near)setUnread(false);
  },[ref,captureHistoryAnchor]);

  useLayoutEffect(()=>{
    const sessionChanged=previousSessionRef.current!==sessionId;
    if(sessionChanged){
      previousSessionRef.current=sessionId;
      previousMessageCountRef.current=messageCount;
      previousNewestRef.current=newestMessageId;
      previousHistoryRevisionRef.current=historyRevision;
      historyAnchorRef.current=undefined;
      previousStreamRevisionRef.current=streamRevision;
      pendingInitialScrollRef.current=true;
      followRef.current=true;
      setNearBottom(true);
      setUnread(false);
    }

    if(pendingInitialScrollRef.current&&(messageCount>0||streaming)){
      pendingInitialScrollRef.current=false;
      previousMessageCountRef.current=messageCount;
      previousNewestRef.current=newestMessageId;
      previousStreamRevisionRef.current=streamRevision;
      scheduleBottom("auto",true,false);
      return;
    }

    const prepended=!sessionChanged&&historyRevision!==previousHistoryRevisionRef.current;
    previousHistoryRevisionRef.current=historyRevision;
    if(prepended){
      cancelScheduledScroll();
      const anchor=historyAnchorRef.current,node=ref.current;
      if(anchor&&anchor.sessionId===sessionId&&node){
        const element=node.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchor.id)}"]`);
        if(element){markProgrammaticScroll("auto");node.scrollTop+=element.getBoundingClientRect().top-node.getBoundingClientRect().top-anchor.offset;}
      }
      historyAnchorRef.current=undefined;
    }
    if(!historyLoading)historyAnchorRef.current=undefined;
    const messageAdded=!sessionChanged&&(newestMessageId!==undefined?newestMessageId!==previousNewestRef.current:!prepended&&messageCount>previousMessageCountRef.current);
    previousNewestRef.current=newestMessageId;
    const streamChanged=!sessionChanged&&streaming&&streamRevision!==previousStreamRevisionRef.current;
    previousMessageCountRef.current=messageCount;
    previousStreamRevisionRef.current=streamRevision;

    if(!messageAdded&&!streamChanged)return;
    const node=ref.current;
    if(followRef.current){
      scheduleBottom(messageAdded?"smooth":"auto",false,true);
    }else if(node&&!isNearBottom(node)){
      setUnread(true);
    }
  },[messageCount,newestMessageId,historyRevision,historyLoading,cancelScheduledScroll,markProgrammaticScroll,ref,scheduleBottom,sessionId,streaming,streamRevision]);

  useLayoutEffect(() => {
    if (!pendingApprovalId) return;
    if (previousApprovalIdRef.current === pendingApprovalId) return;

    previousApprovalIdRef.current = pendingApprovalId;
    if(!followRef.current)return;
    const expectedSession = currentSessionRef.current;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentSessionRef.current !== expectedSession) return;
        const viewport = ref.current;
        if (!viewport) return;

        const selector = `[data-approval-id="${CSS.escape(pendingApprovalId)}"]`;
        const approval = viewport.querySelector<HTMLElement>(selector);

        if (approval) {
          followRef.current = true;
          pendingInitialScrollRef.current = false;
          approval.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
          setNearBottom(true);
          setUnread(false);
          window.setTimeout(() => {
            approval.focus({ preventScroll: true });
          }, 350);
          return;
        }

        scrollToBottom("smooth");
      });
    });
  }, [pendingApprovalId, ref, scrollToBottom, reduceMotion]);

  useLayoutEffect(()=>()=>{
    cancelScheduledScroll();
    if(programmaticTimerRef.current!==undefined)window.clearTimeout(programmaticTimerRef.current);
  },[cancelScheduledScroll]);

  return{isNearBottom:nearBottom,hasUnreadBelow:unread,onScroll,scrollToBottom,anchorLatestUser,prepareHistoryLoad};
}
