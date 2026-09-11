import { useEffect, useState } from "react";
import type { NexoSettings } from "@nexo/shared";
import { useAppStore } from "../stores/app";

export function Settings() {
  const [settings, setSettings] = useState<NexoSettings | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const setPage = useAppStore(state => state.setPage);

  useEffect(() => {
    Promise.all([window.nexo.getSettings(), window.nexo.status()]).then(([current, status]: any) => {
      setSettings(current);
      setModels(status.models ?? []);
    });
  }, []);

  if (!settings) return <div>Carregando…</div>;

  async function save(patch: Partial<NexoSettings>) {
    const next = await window.nexo.updateSettings(patch);
    setSettings(next);
  }

  async function addFolder() {
    const folder = await window.nexo.chooseFolder();
    if (folder && !settings.allowedRoots.includes(folder)) {
      await save({ allowedRoots: [...settings.allowedRoots, folder] });
    }
  }

  async function clearMemory() {
    if (!confirm("Deseja remover todas as memórias salvas no Nexo? Esta ação não pode ser desfeita pela interface.")) return;
    await window.nexo.clearMemory();
    alert("Memória limpa com sucesso.");
  }

  return (
    <div>
      <header>
        <div>
          <h1>Configurações</h1>
          <p>IA, privacidade, permissões e execução.</p>
        </div>
      </header>

      <section className="panel settings">
        <h3>IA local</h3>
        <label>
          URL do Ollama
          <input
            value={settings.ollamaUrl}
            onChange={event => setSettings({ ...settings, ollamaUrl: event.target.value })}
            onBlur={() => void save({ ollamaUrl: settings.ollamaUrl })}
          />
        </label>
        <label>
          Modelo
          <select value={settings.model} onChange={event => void save({ model: event.target.value })}>
            <option value={settings.model}>{settings.model}</option>
            {models.filter(model => model !== settings.model).map(model => <option key={model}>{model}</option>)}
          </select>
        </label>

        <h3>Segurança</h3>
        <label>
          Nível de autonomia
          <select value={settings.autonomy} onChange={event => void save({ autonomy: event.target.value as NexoSettings["autonomy"] })}>
            <option value="cautious">Cauteloso</option>
            <option value="balanced">Equilibrado</option>
            <option value="autonomous">Autônomo</option>
          </select>
        </label>

        <div className="settingBlock">
          <span>Pastas permitidas</span>
          {settings.allowedRoots.map(folder => (
            <div className="folder" key={folder}>
              <code>{folder}</code>
              <button className="ghost" onClick={() => void save({ allowedRoots: settings.allowedRoots.filter(item => item !== folder) })}>Remover</button>
            </div>
          ))}
          <button onClick={() => void addFolder()}>Adicionar pasta</button>
        </div>

        <h3>Privacidade</h3>
        <label className="check">
          <input type="checkbox" checked={settings.privateMode} onChange={event => void save({ privateMode: event.target.checked })} />
          Modo privado
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.runInBackground} onChange={event => void save({ runInBackground: event.target.checked })} />
          Continuar em segundo plano
        </label>

        <h3>Memória</h3>
        <label className="check">
          <input type="checkbox" checked={settings.memoryEnabled} onChange={event => void save({ memoryEnabled: event.target.checked })} />
          Permitir memória
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.memoryAskBeforeSave}
            disabled={!settings.memoryEnabled}
            onChange={event => void save({ memoryAskBeforeSave: event.target.checked })}
          />
          Perguntar antes de salvar informações inferidas pela IA
        </label>
        <small>Pedidos explícitos como “salve meu nome” continuam sendo tratados diretamente; memórias inferidas pela IA exigem aprovação quando esta opção está ativa.</small>

        <div className="settingBlock inlineActions">
          <button className="ghost" onClick={() => setPage("Memória")}>Ver memória</button>
          <button className="ghost dangerGhost" disabled={!settings.memoryEnabled} onClick={() => void clearMemory()}>Limpar memória</button>
        </div>

        <button className="ghost" onClick={async () => alert("Backup criado em: " + await window.nexo.backup())}>Criar backup agora</button>
      </section>
    </div>
  );
}
