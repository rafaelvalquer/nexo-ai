import type { LucideIcon } from "lucide-react";
import { Tooltip } from "./Tooltip";
export function IconButton({icon:Icon,label,...props}:{icon:LucideIcon;label:string}&React.ButtonHTMLAttributes<HTMLButtonElement>){return <Tooltip content={label}><button type="button" className="iconButton" aria-label={label} {...props}><Icon size={16}/></button></Tooltip>;}
