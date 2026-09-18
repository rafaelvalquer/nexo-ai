import type { HTMLAttributes } from "react";

type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  value?: number;
  max?: number;
  label: string;
  valueLabel?: string;
};

export function Progress({ value, max = 100, label, valueLabel, className = "", ...props }: ProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const determinate = Number.isFinite(value);
  const safeValue = determinate ? Math.max(0, Math.min(safeMax, Number(value))) : undefined;
  return <div
    {...props}
    className={`uiProgress ${determinate ? "determinate" : "indeterminate"} ${className}`.trim()}
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={safeMax}
    aria-valuenow={safeValue}
    aria-valuetext={valueLabel ?? (safeValue === undefined ? "Em andamento" : `${Math.round(safeValue / safeMax * 100)}%`)}
  >
    <span className="uiProgressTrack" aria-hidden="true"><span className="uiProgressFill" style={safeValue === undefined ? undefined : { width: `${safeValue / safeMax * 100}%` }}/></span>
  </div>;
}
