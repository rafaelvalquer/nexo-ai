import type { HTMLAttributes } from "react";
import "./skeleton.css";

export function Skeleton({className="",...props}:HTMLAttributes<HTMLDivElement>){return <div aria-hidden="true" {...props} className={`uiSkeleton ${className}`.trim()}/>;}
