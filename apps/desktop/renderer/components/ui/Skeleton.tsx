import type { HTMLAttributes } from "react";
export function Skeleton({className="",...props}:HTMLAttributes<HTMLDivElement>){return <div aria-hidden="true" {...props} className={`uiSkeleton ${className}`.trim()}/>;}
