import type { BrowserRun } from "@nexo/shared/browser-agent";
import { browserPhaseLabel, browserStatusFallback } from "./browser-phase";

export function BrowserProgress({run}:{run:BrowserRun}){
  const label=run.currentStep??browserPhaseLabel(run.phase)??browserStatusFallback(run.status,run.error);
  return <div className="browserProgress" role="status"><span>{label}</span>{run.stepCount>0&&<small>Etapa {run.stepCount}</small>}</div>;
}
