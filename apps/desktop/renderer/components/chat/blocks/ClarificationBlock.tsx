import { useMemo, useState } from "react";
import type { ClarificationBlock as ClarificationModel, ClarificationOption } from "@nexo/shared";
import { useAssistantStore } from "../../../stores/assistant";
import { ChoiceGroup } from "./ChoiceGroup";
import { CustomChoiceInput } from "./CustomChoiceInput";
import { MultiChoiceQuestion } from "./MultiChoiceQuestion";
import { ClarificationActions } from "./ClarificationActions";
import "./clarification.css";

export function ClarificationBlock({ block, conversationId }: {block: ClarificationModel;conversationId?: string;}) {
  const question = block.questions[0];
  const defaultSelection = useMemo(() => question?.suggestedOptionId, [question?.suggestedOptionId]);
  const defaultSelections = useMemo(() => question?.selectedOptionIds ?? [], [question?.selectedOptionIds]);
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultSelection);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelections);
  const [customValue, setCustomValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const syncSession = useAssistantStore(store => store.syncSession);
  const pending = block.state === "pending";

  if (!question) return null;

  async function refresh() {if (conversationId) await syncSession(conversationId);}
  function select(option: ClarificationOption) {setSelectedId(option.id);setCustomValue("");setError("");}
  function changeCustom(value: string) {setCustomValue(value);if (value.trim()) setSelectedId(undefined);else setSelectedId(defaultSelection);setError("");}
  function changeMultiple(ids: string[]) {setSelectedIds(ids);setError(ids.length ? "" : "Selecione pelo menos uma caixa.");}

  async function submit() {
    if (busy || !pending) return;
    const custom = customValue.trim();
    if (question.type === "multi_choice" && !selectedIds.length) {setError("Selecione pelo menos uma caixa.");return;}
    if (question.type !== "multi_choice" && !selectedId && !custom) {setError(question.type==="email"?"Informe um endereço de e-mail.":question.type==="textarea"?"Digite a mensagem.":"Selecione uma opção ou informe um valor.");return;}
    setBusy(true);setError("");
    try {
      await window.nexo.resolveClarification({clarificationId:block.clarificationId,questionId:question.id,optionId:question.type === "multi_choice" || custom ? undefined : selectedId,optionIds:question.type === "multi_choice" ? selectedIds : undefined,customValue:custom || undefined,source:custom ? "custom_input" : "button"});
      await refresh();
    } catch (caught) {setError(caught instanceof Error ? caught.message : String(caught));await refresh().catch(() => undefined);}
    finally {setBusy(false);}
  }

  async function cancel() {if (busy || !pending) return;setBusy(true);setError("");try {await window.nexo.cancelClarification(block.clarificationId);await refresh();} catch (caught) {setError(caught instanceof Error ? caught.message : String(caught));} finally {setBusy(false);}}

  const resolved = block.values?.[question.field];
  const resolvedIds = question.type === "multi_choice" && Array.isArray(resolved)?(question.options ?? []).filter(option => resolved.includes(option.value)).map(option => option.id):[];
  const canSubmit = question.type === "multi_choice" ? selectedIds.length > 0 : Boolean(selectedId || customValue.trim());
  const customControl=question.type==="textarea"
    ? <textarea className="clarificationTextarea" rows={5} value={customValue} placeholder={question.customPlaceholder} disabled={busy} onChange={event=>changeCustom(event.target.value)}/>
    : question.type==="email"
      ? <input className="clarificationTextInput" type="email" value={customValue} placeholder={question.customPlaceholder} disabled={busy} onChange={event=>changeCustom(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&canSubmit){event.preventDefault();void submit();}}}/>
      : <CustomChoiceInput value={customValue} placeholder={question.customPlaceholder} disabled={busy} onChange={changeCustom}/>;

  return <section className="clarificationBlock" aria-label="Esclarecimento necessário">
    <h3>{block.title}</h3>
    {pending ? <div className="clarificationQuestion">
      <p className="clarificationPrompt">{question.prompt}</p>
      {question.type === "multi_choice"?<MultiChoiceQuestion question={question} selectedIds={selectedIds} disabled={busy} onChange={changeMultiple}/>:question.options?.length?<ChoiceGroup options={question.options} selectedId={selectedId} disabled={busy} onSelect={select}/>:null}
      {question.type !== "multi_choice" && question.allowCustomValue ? customControl : null}
      {question.helperText?<p className="clarificationHelper">{question.helperText}</p>:null}
      <ClarificationActions busy={busy} canSubmit={canSubmit} submitLabel={question.submitLabel} onCancel={() => void cancel()} onSubmit={() => void submit()} />
    </div> : block.state === "submitted" ? <div className="clarificationSubmitted">
      <p className="clarificationResolved">✓ Configuração salva</p>
      {question.type === "multi_choice"?<MultiChoiceQuestion question={question} selectedIds={resolvedIds} disabled onChange={() => undefined}/>:<p className="clarificationResolvedValue">{formatValue(resolved)}</p>}
    </div> : <p className="clarificationCancelled">{block.state === "expired" ? "Pergunta expirada." : "Pergunta cancelada."}</p>}
    {error ? <p className="clarificationError" role="alert">{error}</p> : null}
  </section>;
}

function formatValue(value: unknown) {if (value === "downloads") return "Downloads";if (value === "documents") return "Documentos";if (value === "desktop") return "Desktop";if(Array.isArray(value))return value.map(String).join(", ");if (typeof value === "string" && value) return value;return "Resposta enviada";}
