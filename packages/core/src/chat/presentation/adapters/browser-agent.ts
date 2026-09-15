import { randomUUID } from "node:crypto";
import type { BrowserAgentToolResult } from "@nexo/shared/browser-agent";
import type { PresentationAdapter } from "../types.js";

export const browserAgentAdapter:PresentationAdapter = result => {
  if (!result.ok || !result.data || typeof result.data !== "object") return undefined;
  const data = result.data as Partial<BrowserAgentToolResult>;
  const run = data.run;
  if (data.command !== "started" || !run) return undefined;
  return {
    presentation:{
      version:1,
      blocks:[{
        id:randomUUID(),
        version:1,
        type:"browser_run",
        runId:run.id,
        title:run.request.length > 72 ? `${run.request.slice(0, 69)}…` : run.request,
        status:run.status,
        url:run.currentUrl,
        pageTitle:run.pageTitle,
        step:run.currentStep,
        startedAt:run.startedAt,
        finishedAt:run.finishedAt,
        finalThumbnail:run.finalThumbnail
      }]
    },
    bindings:[]
  };
};
