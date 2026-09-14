import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export function StatusBadge({status,label,help}:{status:string;label:string;help:string}):ReactNode {
  return <Tooltip content={help}><span className={`connectionStatus ${status}`} tabIndex={0}>{label}</span></Tooltip>;
}
