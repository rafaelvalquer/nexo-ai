import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Check, ChevronDown, CircleDot, Clock3, LoaderCircle, XCircle } from "lucide-react";
import type { BackgroundTaskStatus } from "@nexo/shared";
import { motionTokens } from "../../design/motion";
import "./execution-summary.css";

type ExecutionStatus = BackgroundTaskStatus | "idle";

const activeStatuses = new Set<ExecutionStatus>(["queued", "running"]);
const waitingStatuses = new Set<ExecutionStatus>(["waiting_approval", "waiting_review"]);

function statusLabel(status: ExecutionStatus) {
  if (status === "queued") return "Na fila";
  if (status === "running") return "Em andamento";
  if (status === "waiting_approval") return "Aguardando aprovação";
  if (status === "waiting_review") return "Aguardando revisão";
  if (status === "completed") return "Execução concluída";
  if (status === "failed") return "Execução com erro";
  if (status === "cancelled") return "Execução cancelada";
  return "Sem execução ativa";
}

export function ExecutionSummary({
  history,
  elapsed,
  status = "running"
}: {
  history: string[];
  elapsed: number;
  status?: ExecutionStatus;
}) {
  const reduceMotion = useReducedMotion();
  const stepsId = useId();
  const isActive = activeStatuses.has(status);
  const isWaiting = waitingStatuses.has(status);
  const isFailed = status === "failed";
  const hasExecution = status !== "idle";
  const currentIndex = isActive || isWaiting ? history.length - 1 : -1;
  const [open, setOpen] = useState(isActive || isWaiting);
  const summary = isActive || isWaiting
    ? `${statusLabel(status)} · ${history.length} ${history.length === 1 ? "etapa" : "etapas"}`
    : status === "completed"
      ? `Concluída · ${history.length} ${history.length === 1 ? "etapa" : "etapas"} · ${elapsed}s`
      : statusLabel(status);

  return <section className={`executionSummary ${isActive ? "isActive" : isWaiting ? "isWaiting" : status === "failed" ? "isFailed" : status === "completed" ? "isComplete" : "isIdle"}`} aria-label="Linha do tempo da execução">
    <button type="button" aria-expanded={open} aria-controls={stepsId} onClick={() => setOpen(value => !value)}>
      <ChevronDown size={15} className={open ? "" : "closed"} aria-hidden="true" />
      <span>{summary}</span>
      {isActive && <small>{elapsed}s</small>}
    </button>
    <AnimatePresence initial={false}>
      {open && hasExecution && <motion.ol id={stepsId} aria-label="Etapas operacionais" initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : motionTokens.duration.fast / 1000, ease: motionTokens.ease.out }}>
        {history.map((step, index) => {
          const current = index === currentIndex;
          const failed = isFailed && index === history.length - 1;
          const Icon = failed ? XCircle : current && isWaiting ? Clock3 : current && isActive ? (status === "queued" ? CircleDot : LoaderCircle) : status === "cancelled" && index === history.length - 1 ? AlertCircle : Check;
          return <motion.li key={`${index}-${step}`} layout initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={reduceMotion ? { duration: 0 } : motionTokens.spring.fast} className={current ? "active" : failed ? "failed" : status === "cancelled" && index === history.length - 1 ? "cancelled" : "done"} aria-current={current ? "step" : undefined}>
            <Icon size={14} aria-hidden="true" />
            <span aria-live={current ? "polite" : undefined}>{step}</span>
            {current && isActive && <small>{elapsed}s</small>}
          </motion.li>;
        })}
      </motion.ol>}
    </AnimatePresence>
  </section>;
}
