import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Sparkles } from "lucide-react";
import type { AutomationConditionOperator, AutomationRunViewModel } from "@nexo/shared";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../design/motion";
import { NexoDrawer } from "../components/ui/NexoDrawer";
import { Tooltip } from "../components/ui/Tooltip";

type MacroField = { key: string; label: string; type: "text" | "number" | "select" | "path" | "boolean"; required?: boolean; options?: Array<{ value: string; label: string }>; placeholder?: string };
type MacroAction = { id: string; title: string; description: string; category: string; fields: MacroField[]; risk: string };
type MacroStep = { id: string; type: string; config: Record<string, unknown>; continueOnError?: boolean; condition?: { id: string; field: string; operator: AutomationConditionOperator; value?: unknown } };
type Props = { close: () => void; done: () => Promise<void>; fail: (message: string) => void };

const actionRiskLabel = (risk: string) => risk === "critical" ? "CRÍTICA" : risk === "write" ? "ESCRITA" : "LEITURA";

export function MacroForm({ close, done, fail }: Props) {
  const [catalog, setCatalog] = useState<MacroAction[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<MacroStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [draftRun, setDraftRun] = useState<Pick<AutomationRunViewModel, "status" | "summary" | "error" | "steps">>();
  const [drafting, setDrafting] = useState(false);
  const [selected, setSelected] = useState("");
  const [draggedStep, setDraggedStep] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    void window.nexo.listAutomationActions().then((value: unknown) => {
      const actions = value as MacroAction[];
      setCatalog(actions);
      setSelected(actions[0]?.id ?? "");
    }).catch(error => fail(error instanceof Error ? error.message : "Não foi possível carregar as etapas."));
  }, [fail]);

  const addStep = () => {
    const action = catalog.find(item => item.id === selected);
    if (!action) return;
    setSteps(current => [...current, { id: crypto.randomUUID(), type: action.id, config: Object.fromEntries(action.fields.map(field => [field.key, field.type === "boolean" ? false : ""])) }]);
  };
  const updateStep = (id: string, key: string, value: unknown) => setSteps(current => current.map(step => step.id === id ? { ...step, config: { ...step.config, [key]: value } } : step));
  const updateCondition = (id: string, patch: Partial<NonNullable<MacroStep["condition"]>>) => setSteps(current => current.map(step => step.id === id ? { ...step, condition: { id: step.condition?.id ?? crypto.randomUUID(), field: step.condition?.field ?? "$trigger.data.path", operator: step.condition?.operator ?? "exists", ...step.condition, ...patch } } : step));
  const toggleCondition = (id: string, enabled: boolean) => setSteps(current => current.map(step => step.id === id ? { ...step, condition: enabled ? { id: crypto.randomUUID(), field: "$trigger.data.path", operator: "exists", value: true } : undefined } : step));
  const moveStep = (index: number, delta: number) => setSteps(current => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    setReorderAnnouncement(`Etapa ${next[target].type} movida para a posição ${target + 1} de ${next.length}.`);
    return next;
  });
  const reorderStep = (sourceId: string, targetIndex: number) => setSteps(current => {
    const sourceIndex = current.findIndex(step => step.id === sourceId);
    if (sourceIndex < 0 || sourceIndex === targetIndex) return current;
    const next = [...current];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    setReorderAnnouncement(`Etapa ${item.type} movida para a posição ${targetIndex + 1} de ${next.length}.`);
    return next;
  });
  const draftWithAI = async () => {
    if (description.trim().length < 8) { fail("Descreva o que a macro deve fazer."); return; }
    try {
      setDrafting(true);
      const draft = await window.nexo.draftMacroFromNatural({ name: name.trim() || undefined, description: description.trim() }) as { name: string; description: string; actions: Array<{ id: string; type: string; config: Record<string, unknown> }> };
      setName(draft.name);
      setSteps(draft.actions);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Não foi possível gerar o rascunho.");
    } finally { setDrafting(false); }
  };
  const formInput = (enabled: boolean) => ({ name: name.trim(), description: description.trim() || "Macro criada no editor", icon: "zap", enabled, trigger: { type: "manual" as const }, conditions: [], conditionOperator: "AND" as const, actions: steps, output: { type: "notification" as const }, policy: { maxConcurrentRuns: 1, retries: { enabled: true, count: 2 }, onRepeatedFailure: "pause" as const } });
  const validateForm = () => {
    if (!name.trim() || !steps.length) { fail("Informe o nome e adicione pelo menos uma etapa."); return false; }
    for (const [index, step] of steps.entries()) {
      const definition = catalog.find(item => item.id === step.type);
      if (definition?.fields.some(field => field.required && !String(step.config[field.key] ?? "").trim())) { fail(`Revise e preencha os campos obrigatórios da etapa ${index + 1}.`); return false; }
      if (step.condition && (!step.condition.field.trim() || !step.condition.operator)) { fail(`Revise a condição da etapa ${index + 1}.`); return false; }
      if (step.condition && step.condition.operator !== "exists" && step.condition.value === undefined) { fail(`Informe o valor da condição da etapa ${index + 1}.`); return false; }
    }
    return true;
  };
  const testDraft = async () => {
    if (!validateForm()) return;
    try { setTesting(true); setDraftRun(undefined); const run = await window.nexo.testAutomationDraft(formInput(false)) as AutomationRunViewModel | undefined; if (run) setDraftRun(run); }
    catch (error) { fail(error instanceof Error ? error.message : "Não foi possível testar esta macro."); }
    finally { setTesting(false); }
  };
  const save = async (enabled: boolean) => {
    if (!validateForm()) return;
    try { setSaving(true); await window.nexo.createAutomationV2(formInput(enabled)); await done(); }
    catch (error) { fail(error instanceof Error ? error.message : "Não foi possível salvar a macro."); }
    finally { setSaving(false); }
  };

  return <NexoDrawer open onClose={close} eyebrow="EDITOR DE MACRO" title="Nova macro" className="macroEditorDrawer">
    <section className="automationBuilder">
      <header><div><p>Descreva a rotina para gerar um rascunho revisável. Etapas de escrita seguem as permissões do Nexo.</p></div></header>
      <div className="builderBody">
        <label>Nome<input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Início do trabalho" /></label>
        <label>O que esta macro deve fazer?<textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Abra Chrome, VS Code e a pasta Projetos; depois abra localhost:3000." /></label>
        <button type="button" className="ghost" onClick={() => void draftWithAI()} disabled={drafting || description.trim().length < 8}><Sparkles size={15} />{drafting ? "Gerando rascunho…" : "Gerar etapas com IA"}</button>
        <p className="builderMuted">Confira todas as etapas e complete campos em branco antes de salvar.</p>
        <label>Adicionar etapa manual<select value={selected} onChange={event => setSelected(event.target.value)}>{catalog.map(item => <option key={item.id} value={item.id}>{item.title} · {actionRiskLabel(item.risk)}</option>)}</select></label>
        <button type="button" className="ghost" onClick={addStep} disabled={!selected}><Plus size={15} /> Adicionar etapa</button>
        <ol className="macroStepList">{steps.map((step, index) => {
          const definition = catalog.find(item => item.id === step.type);
          return <motion.li layout={!reduceMotion} transition={reduceMotion ? { duration: 0 } : { layout: motionTokens.spring.normal }} className={dropTarget === step.id ? "dropTarget" : ""} key={step.id}
            onPointerEnter={() => { if (draggedStep && draggedStep !== step.id && dropTarget !== step.id) { setDropTarget(step.id); reorderStep(draggedStep, index); } }}
            onPointerUp={() => { setDraggedStep(null); setDropTarget(null); }}
            onDragOver={event => { if (draggedStep && draggedStep !== step.id) { event.preventDefault(); setDropTarget(step.id); } }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
            onDrop={event => { event.preventDefault(); if (draggedStep) reorderStep(draggedStep, index); setDraggedStep(null); setDropTarget(null); }}>
            <div className="macroStepHeading"><b>{index + 1}. {definition?.title ?? step.type}</b><span>
              <Tooltip content={`Reordenar etapa ${index + 1} (Alt + ↑ / ↓)`}><button type="button" className="macroDragHandle ghost" draggable aria-label={`Arrastar etapa ${index + 1}; use Alt+setas para reordenar`} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onPointerDown={event => { if (event.button === 0) setDraggedStep(step.id); }} onPointerCancel={() => { setDraggedStep(null); setDropTarget(null); }}
                onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", step.id); setDraggedStep(step.id); }}
                onDragEnd={() => { setDraggedStep(null); setDropTarget(null); }}
                onKeyDown={event => { if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); moveStep(index, -1); } if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); moveStep(index, 1); } }}><GripVertical size={14} /></button></Tooltip>
              <Tooltip content={`Mover etapa ${index + 1} para cima`}><button aria-label="Mover etapa para cima" disabled={index === 0} className="ghost" onClick={() => moveStep(index, -1)}><ChevronUp size={14} /></button></Tooltip>
              <Tooltip content={`Mover etapa ${index + 1} para baixo`}><button aria-label="Mover etapa para baixo" disabled={index === steps.length - 1} className="ghost" onClick={() => moveStep(index, 1)}><ChevronDown size={14} /></button></Tooltip>
              <button className="ghost" onClick={() => setSteps(current => current.filter(item => item.id !== step.id))}>Remover</button>
            </span></div>
            <label className="check"><input type="checkbox" checked={Boolean(step.condition)} onChange={event => toggleCondition(step.id, event.target.checked)} />Executar somente quando a condição for atendida</label>
            {step.condition && <div className="macroCondition">
              <label>Campo<input value={step.condition.field} onChange={event => updateCondition(step.id, { field: event.target.value })} placeholder="$trigger.data.path ou $actions.etapa.resultado" /></label>
              <label>Operador<select value={step.condition.operator} onChange={event => updateCondition(step.id, { operator: event.target.value as AutomationConditionOperator, value: event.target.value === "exists" ? true : "" })}>{[["equals", "é igual a"], ["notEquals", "é diferente de"], ["contains", "contém"], ["notContains", "não contém"], ["startsWith", "começa com"], ["endsWith", "termina com"], ["greaterThan", "é maior que"], ["lessThan", "é menor que"], ["exists", "existe"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {step.condition.operator === "exists" ? <label>Estado<select value={String(step.condition.value !== false)} onChange={event => updateCondition(step.id, { value: event.target.value === "true" })}><option value="true">Existe</option><option value="false">Não existe</option></select></label> : <label>Valor<input value={String(step.condition.value ?? "")} onChange={event => updateCondition(step.id, { value: event.target.value })} placeholder="Valor para comparar" /></label>}
              <small>Uma condição falsa registra a etapa como ignorada. Variáveis: {"{{today}}"}, {"{{downloads}}"}, {"{{documents}}"}, {"{{desktop}}"}, {"{{macro.output}}"}.</small>
            </div>}
            {definition?.fields.map(field => <label key={field.key}>{field.label}{field.type === "select" ? <select value={String(step.config[field.key] ?? "")} onChange={event => updateStep(step.id, field.key, event.target.value)}><option value="">Selecione…</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "boolean" ? <input type="checkbox" checked={Boolean(step.config[field.key])} onChange={event => updateStep(step.id, field.key, event.target.checked)} /> : <input type={field.type === "number" ? "number" : "text"} value={String(step.config[field.key] ?? "")} placeholder={field.placeholder} onChange={event => updateStep(step.id, field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} />}</label>)}
          </motion.li>;
        })}</ol>
        <span className="reorderAnnouncement" role="status" aria-live="polite">{reorderAnnouncement}</span>
        {draftRun && <div className="draftTestResult" role="status"><strong>{draftRun.status === "success" ? "Simulação concluída" : "Simulação com atenção"}</strong><p>{draftRun.summary ?? draftRun.error ?? "O teste da macro terminou."}</p>{draftRun.steps?.map(step => <small key={step.id}>{step.ordinal}. {step.summary ?? step.error ?? step.status}</small>)}</div>}
      </div>
      <footer className="builderFooter"><button className="ghost" onClick={close}>Cancelar</button><button className="ghost" disabled={saving || testing || drafting || steps.length === 0} onClick={() => void testDraft()}>{testing ? "Testando…" : "Testar rascunho (simulação)"}</button><button disabled={saving || testing} onClick={() => void save(false)}>Salvar pausada</button><button disabled={saving || testing} onClick={() => void save(true)}>Salvar e ativar</button></footer>
    </section>
  </NexoDrawer>;
}
