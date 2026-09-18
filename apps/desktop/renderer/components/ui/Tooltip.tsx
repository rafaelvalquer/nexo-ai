import { cloneElement, useId,useState,type FocusEvent as ReactFocusEvent,type KeyboardEvent as ReactKeyboardEvent,type MouseEvent as ReactMouseEvent,type ReactElement } from "react";

export function Tooltip({content,children,className}:{content:string;children:ReactElement;className?:string}){
  const generatedId=useId();
  const id=`tooltip-${generatedId.replace(/:/g,"")}`;
  const[open,setOpen]=useState(false);
  const child=children as ReactElement<Record<string,unknown>>;
  const previousFocus=child.props.onFocus as ((event:ReactFocusEvent)=>void)|undefined;
  const previousBlur=child.props.onBlur as ((event:ReactFocusEvent)=>void)|undefined;
  const previousKeyDown=child.props.onKeyDown as ((event:ReactKeyboardEvent)=>void)|undefined;
  const previousClick=child.props.onClick as ((event:ReactMouseEvent)=>void)|undefined;
  const describedBy=[child.props["aria-describedby"],open?id:undefined].filter(Boolean).join(" ")||undefined;
  return <span className={`tooltipWrap ${className??""}`.trim()} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>{cloneElement(child,{"aria-describedby":describedBy,onFocus:(event:ReactFocusEvent)=>{previousFocus?.(event);setOpen(true);},onBlur:(event:ReactFocusEvent)=>{previousBlur?.(event);setOpen(false);},onKeyDown:(event:ReactKeyboardEvent)=>{previousKeyDown?.(event);if(event.key==="Escape"&&!event.defaultPrevented)setOpen(false);},onClick:(event:ReactMouseEvent)=>{previousClick?.(event);setOpen(false);}})}{open&&<span id={id} role="tooltip" className="tooltipBubble">{content}</span>}</span>;
}
