import { useEffect, useState } from "react";

type Trigger = "schedule" | "manual" | "app-start" | "file-created" | "file-changed";

export function Automations() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "Resumo diário", when: "Todos os dias às 08:00", command: "Veja meus e-mails e mostre os importantes.", trigger: "schedule" as Trigger, watchPath: "" });
  const [error, setError] = useState("");
  const load = () => window.nexo.listAutomations().then(setRows);
  useEffect(() => { void load(); }, []);

  async function chooseFolder() { const selected = await window.nexo.chooseFolder(); if (selected) setForm(current => ({ ...current, watchPath: selected })); }
  async function create() {
    if (!form.name || !form.command || (form.trigger === "schedule" && !form.when) || (["file-created", "file-changed"].includes(form.trigger) && !form.watchPath)) return;
    try {
      setError("");
      if (form.trigger === "schedule") await window.nexo.createNaturalAutomation({ name: form.name, when: form.when, command: form.command });
      else await window.nexo.createAutomation({ name: form.name, command: form.command, enabled: true, triggerType: form.trigger, watchPath: form.watchPath || undefined });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  const needsFolder = form.trigger === "file-created" || form.trigger === "file-changed";
  return <div><header><div><h1>Automações</h1><p>Descreva quando o Nexo deve agir. O computador precisa estar ligado.</p></div></header>
    <section className="panel"><h3>Nova automação</h3><div className="form3"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome"/><select value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value as Trigger })}><option value="schedule">Agendamento natural</option><option value="manual">Execução manual</option><option value="app-start">Ao abrir o Nexo</option><option value="file-created">Novo arquivo na pasta</option><option value="file-changed">Arquivo alterado na pasta</option></select>{form.trigger === "schedule" && <input value={form.when} onChange={e => setForm({ ...form, when: e.target.value })} placeholder="Todos os dias às 08:00"/>}<input value={form.command} onChange={e => setForm({ ...form, command: e.target.value })} placeholder="O que fazer"/>{needsFolder && <div className="folderTrigger"><input value={form.watchPath} readOnly placeholder="Escolha uma pasta"/><button className="ghost" onClick={() => void chooseFolder()}>Escolher pasta</button></div>}<button onClick={() => void create()}>Criar</button></div>{error && <p className="error">{error}</p>}<small>{form.trigger === "schedule" ? "Exemplos: “Todos os dias às 08:00”, “Dias úteis às 09:30” ou “Sexta às 16:00”." : form.trigger === "manual" ? "A automação ficará pronta e só será executada quando você clicar em Executar." : needsFolder ? "O Nexo observa a pasta escolhida enquanto a automação estiver ativa." : "A automação será executada a cada inicialização do Nexo."}</small></section>
    <section className="panel list">{rows.length === 0 ? <div className="empty">Nenhuma automação criada.</div> : rows.map(a => <div className="row" key={a.id}><div><b>{a.name}</b><span>{a.schedule ?? a.watchPath ?? a.triggerType} · {a.command}</span></div><div className="actions">{a.triggerType === "manual" && <button className="ghost" onClick={async () => { await window.nexo.runAutomation(a.id); await load(); }}>Executar</button>}<button className="ghost" onClick={async () => { await window.nexo.toggleAutomation(a.id, !a.enabled); await load(); }}>{a.enabled ? "Pausar" : "Ativar"}</button><button className="ghost" onClick={async () => { await window.nexo.removeAutomation(a.id); await load(); }}>Excluir</button></div></div>)}</section>
  </div>;
}
