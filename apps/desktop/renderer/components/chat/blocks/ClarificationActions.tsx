export function ClarificationActions({ busy, canSubmit, submitLabel, onCancel, onSubmit }: {
  busy: boolean;
  canSubmit: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return <div className="clarificationActions">
    <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
    <button type="button" disabled={busy || !canSubmit} onClick={onSubmit}>
      {busy ? "Processando…" : submitLabel ?? "Continuar"}
    </button>
  </div>;
}
