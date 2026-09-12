import { useLayoutEffect, type RefObject } from "react";
export function useAutoGrowTextarea(ref:RefObject<HTMLTextAreaElement>,value:string){useLayoutEffect(()=>{const node=ref.current;if(!node)return;node.style.height="0px";node.style.height=`${Math.min(Math.max(node.scrollHeight,52),156)}px`;node.style.overflowY=node.scrollHeight>156?"auto":"hidden";},[ref,value]);}
