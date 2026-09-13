import { useCallback,useEffect,useRef,useState,type RefObject } from "react";

export function useChatAutoScroll(ref:RefObject<HTMLDivElement>,dependency:unknown,streaming:boolean){
  const[nearBottom,setNearBottom]=useState(true),[unread,setUnread]=useState(false);
  const followRef=useRef(true);
  const anchoringRef=useRef(false);

  const scrollToBottom=useCallback((behavior:ScrollBehavior="smooth")=>{
    const node=ref.current;
    followRef.current=true;
    if(node)node.scrollTo({top:node.scrollHeight,behavior});
    setNearBottom(true);
    setUnread(false);
  },[ref]);

  const anchorLatestUser=useCallback((behavior:ScrollBehavior="smooth")=>{
    const node=ref.current;
    if(!node)return;
    const messages=node.querySelectorAll<HTMLElement>(".chatMessage.user");
    const latest=messages.item(messages.length-1);
    if(!latest)return;
    followRef.current=false;
    anchoringRef.current=true;
    const viewport=node.getBoundingClientRect();
    const message=latest.getBoundingClientRect();
    const top=Math.max(0,node.scrollTop+(message.top-viewport.top)-14);
    node.scrollTo({top,behavior});
    setUnread(false);
    window.setTimeout(()=>{anchoringRef.current=false;},behavior==="smooth"?400:0);
  },[ref]);

  const onScroll=useCallback(()=>{
    const node=ref.current;
    if(!node)return;
    const near=node.scrollHeight-node.scrollTop-node.clientHeight<=120;
    setNearBottom(near);
    if(anchoringRef.current)return;
    followRef.current=near;
    if(near)setUnread(false);
  },[ref]);

  useEffect(()=>{
    const node=ref.current;
    if(!node)return;
    const near=node.scrollHeight-node.scrollTop-node.clientHeight<=120;
    setNearBottom(near);
    if(!streaming)return;
    if(followRef.current&&near){
      scrollToBottom("auto");
    }else{
      setUnread(true);
    }
  },[dependency,ref,scrollToBottom,streaming]);

  return{isNearBottom:nearBottom,hasUnreadBelow:unread,onScroll,scrollToBottom,anchorLatestUser};
}
