import { useMemo } from "react";
import { Check, CircleDot, Files, Globe2, Mail, MonitorCog, Sparkles, X } from "lucide-react";
import type { AgentVisualEvent, BackgroundTask } from "@nexo/shared";
import { useOfficeStore } from "../../pixel-office/state/office-store";

const stations = {
  "document-station": { label: "Arquivos", Icon: Files },
  "browser-station": { label: "Web", Icon: Globe2 },
  "mail-station": { label: "E-mail", Icon: Mail },
  "calendar-station": { label: "Agenda", Icon: Check },
  "system-station": { label: "Sistema", Icon: MonitorCog },
  "approval-gate": { label: "Aprovação", Icon: Check },
  "central-desk": { label: "Nexo", Icon: Sparkles },
  "rest-area": { label: "Nexo", Icon: Sparkles }
} as const;

type ToolEvent = Extract<AgentVisualEvent["type"], "tool.started" | "tool.completed">;

function isToolEvent(event: AgentVisualEvent): event is AgentVisualEvent & { type: ToolEvent } {
  return event.type === "tool.started" || event.type === "tool.completed";
}

export function ToolChips({ task }: { task: BackgroundTask }) {
  const recent = useOfficeStore(state => state.recent);
  const tools = useMemo(() => {
    if (!task.runId) return [];
    const events = recent.filter(event => event.runId === task.runId && isToolEvent(event));
    const starts = events.filter(event => event.type === "tool.started").slice(-3);
    return starts.map(start => {
      const startIndex = events.findIndex(event => event.eventId === start.eventId);
      const nextStart = events.slice(startIndex + 1).find(event => event.type === "tool.started" && event.toolName === start.toolName);
      const completion = events.find(event => event.type === "tool.completed" && event.toolName === start.toolName && event.timestamp >= start.timestamp && (!nextStart || event.timestamp < nextStart.timestamp));
      const station = stations[start.stationId ?? "central-desk"] ?? stations["central-desk"];
      return { key: start.eventId, label: station.label, Icon: station.Icon, action: start.label, failed: completion?.severity === "error", complete: Boolean(completion) };
    });
  }, [recent, task.runId]);

  if (!tools.length) return null;
  return <ul className="assistantToolChips" aria-label="Ferramentas usadas nesta execução">
    {tools.map(({ key, label, Icon, action, failed, complete }) => <li key={key} className={`assistantToolChip${complete ? " isComplete" : " isActive"}${failed ? " hasError" : ""}`}>
      <span className="assistantToolIcon" aria-hidden="true">{failed ? <X size={13}/> : complete ? <Check size={13}/> : <CircleDot size={13}/>}</span>
      <Icon size={14} aria-hidden="true"/>
      <span className="assistantToolCopy"><b>{label}</b><small>{failed ? "Etapa com erro" : complete ? "Etapa concluída" : action}</small></span>
    </li>)}
  </ul>;
}
