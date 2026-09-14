import { useMemo, useState } from "react";
import type { ClarificationBlock as ClarificationModel, ClarificationOption } from "@nexo/shared";
import { useAssistantStore } from "../../../stores/assistant";
import { ChoiceGroup } from "./ChoiceGroup";
import { CustomChoiceInput } from "./CustomChoiceInput";
import "./clarification.css";

export function ClarificationBlock({ block, conversationId }: {
  block: ClarificationModel;
  conversationId?: string;
}) {
  const question = block.questions[0];
  const defaultSelection = useMemo(() => question?.suggestedOptionId, [question?.suggestedOptionId]);
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultSelection);
  const [customValue, setCustomValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const syncSession = useAssistantStore(store => store.syncSession);
  const pending = block.state === "pending";

  if (!question) return null;

  async function refresh() {
    if (conversationId) await syncSession(conversationId);
  }

  function select(option: ClarificationOption) {
    setSelectedId(option.id);
    setCustomValue("");
    setError("");
  }

  function changeCustom(value: string) {
    setCustomValue(value);
    if (value.trim()) setSelectedId(undefined);
    else setSelectedId(defaultSelection);
    setError("");
  }

  async function submit() {
    if (busy || !pending) return;
    const custom = customValue.trim();
    if (!selectedId && !custom) {
      setError("Selecione uma opção ou informe outra pasta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await window.nexo.resolveClarification({
        clarificationId: block.clarificationId,
        questionId: question.id,
        optionId: custom ? undefined : selectedId,
        customValue: custom || undefined,
        source: custom ? "custom_input" : "button",
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy || !pending) return;
    setBusy(true);
    setError("");
    try {
      await window.nexo.cancelClarification(block.clarificationId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const resolved = block.values?.[question.field];
  return <section className="clarificationBlock" aria-label="Esclarecimento necessário">
    <h3>{block.title}</h3>
    {pending ? <div className="clarificationQuestion">
      <p className="clarificationPrompt">{question.prompt}</p>
      {question.options?.length ? <ChoiceGroup options={question.options} selectedId={selectedId} disabled={busy} onSelect={select} /> : null}
      {question.allowCustomValue ? <CustomChoiceInput value={customValue} placeholder={question.customPlaceholder} disabled={busy} onChange={changeCustom} /> : null}
      <div className="clarificationActions">
        <button type="button" disabled={busy} onClick={() => void cancel()}>Cancelar</button>
        <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Processando…" : "Continuar"}</button>
      </div>
    </div> : block.state === "submitted" ? <p className="clarificationResolved">✓ {formatValue(resolved)}</p> : <p className="clarificationCancelled">{block.state === "expired" ? "Pergunta expirada." : "Pergunta cancelada."}</p>}
    {error ? <p className="clarificationError" role="alert">{error}</p> : null}
  </section>;
}

function formatValue(value: unknown) {
  if (value === "downloads") return "Downloads";
  if (value === "documents") return "Documentos";
  if (value === "desktop") return "Desktop";
  if (typeof value === "string" && value) return value;
  return "Resposta enviada";
}
