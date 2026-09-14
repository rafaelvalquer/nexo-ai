import { useCallback,useLayoutEffect,useRef,useState,type RefObject } from "react";

type ChatAutoScrollOptions={
  sessionId?:string;
  messageCount:number;
  streaming:boolean;
  streamRevision?:string|number;
};

const NEAR_BOTTOM_THRESHOLD=120;

function isNearBottom(node:HTMLDivElement){
  return node.scrollHeight-node.scrollTop-node.clientHeight<=NEAR_BOTTOM_THRESHOLD;
}

export function useChatAutoScroll(ref:RefObject<HTMLDivElement>,options:ChatAutoScrollOptions){
  const{sessionId,messageCount,streaming,streamRevision=0}=options;
  const[nearBottom,setNearBottom]=useState(true),[unread,setUnread]=useState(false);
  const followRef=useRef(true);
  const anchoringRef=useRef(false);
  const programmaticRef=useRef(false);
  const programmaticTimerRef=useRef<number>();
  const pendingInitialScrollRef=useRef(true);
  const previousSessionRef=useRef<string>();
  const previousMessageCountRef=useRef(0);
  const previousStreamRevisionRef=useRef<string|number>(streamRevision);
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
    const node=ref.current;
    followRef.current=true;
    pendingInitialScrollRef.current=false;
    if(node){
      markProgrammaticScroll(behavior);
      node.scrollTo({top:node.scrollHeight,behavior});
    }
    setNearBottom(true);
    setUnread(false);
  },[markProgrammaticScroll,ref]);

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
    markProgrammaticScroll(behavior);
    node.scrollTo({top,behavior});
    setUnread(false);
    window.setTimeout(()=>{anchoringRef.current=false;},behavior==="smooth"?400:0);
  },[markProgrammaticScroll,ref]);

  const onScroll=useCallback(()=>{
    const node=ref.current;
    if(!node)return;
    const near=isNearBottom(node);
    setNearBottom(near);
    if(anchoringRef.current)return;
    if(programmaticRef.current){
      if(near)setUnread(false);
      return;
    }
    followRef.current=near;
    if(near)setUnread(false);
  },[ref]);

  useLayoutEffect(()=>{
    const sessionChanged=previousSessionRef.current!==sessionId;
    if(sessionChanged){
      previousSessionRef.current=sessionId;
      previousMessageCountRef.current=messageCount;
      previousStreamRevisionRef.current=streamRevision;
      pendingInitialScrollRef.current=true;
      followRef.current=true;
      setNearBottom(true);
      setUnread(false);
    }

    if(pendingInitialScrollRef.current&&(messageCount>0||streaming)){
      pendingInitialScrollRef.current=false;
      scheduleBottom("auto",true,false);
      return;
    }

    const messageAdded=!sessionChanged&&messageCount>previousMessageCountRef.current;
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
  },[messageCount,ref,scheduleBottom,sessionId,streaming,streamRevision]);

  useLayoutEffect(()=>()=>{
    cancelScheduledScroll();
    if(programmaticTimerRef.current!==undefined)window.clearTimeout(programmaticTimerRef.current);
  },[cancelScheduledScroll]);

  return{isNearBottom:nearBottom,hasUnreadBelow:unread,onScroll,scrollToBottom,anchorLatestUser};
}
