import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export function InfoLabel({children,help}:{children:ReactNode;help:string}) {
  return <span className="infoLabel">{children}<Tooltip content={help}><span className="infoMark" aria-hidden="true">i</span></Tooltip></span>;
}
