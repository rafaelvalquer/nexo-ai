import { cloneElement, useId,useState,type ReactElement } from "react";

export function Tooltip({content,children}:{content:string;children:ReactElement}){
  const generatedId=useId();
  const id=`tooltip-${generatedId.replace(/:/g,"")}`;
  const[open,setOpen]=useState(false);
  const child=children as ReactElement<Record<string,unknown>>;
  return <span className="tooltipWrap" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}}>{cloneElement(child,{tabIndex:child.props.tabIndex??0,"aria-describedby":open?id:undefined,onFocus:()=>setOpen(true),onBlur:()=>setOpen(false)})}{open&&<span id={id} role="tooltip" className="tooltipBubble">{content}</span>}</span>;
}
