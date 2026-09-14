import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function Accordion({id,title,summary,open,onToggle,children}:{id:string;title:string;summary?:ReactNode;open:boolean;onToggle:()=>void;children:ReactNode}){
  return <section className="nexoAccordion"><button type="button" className="nexoAccordionTrigger" aria-expanded={open} aria-controls={id} onClick={onToggle}><span>{title}</span>{summary&&<small>{summary}</small>}<ChevronDown size={16} className={open?"expanded":""}/></button><div id={id} hidden={!open} className="nexoAccordionContent">{children}</div></section>;
}
