import type { HTMLAttributes } from "react";
export function Badge({tone="neutral",className="",...props}:HTMLAttributes<HTMLSpanElement>&{tone?:"neutral"|"success"|"warning"|"danger"|"info"}){return <span {...props} className={`uiBadge ${tone} ${className}`.trim()}/>;}
