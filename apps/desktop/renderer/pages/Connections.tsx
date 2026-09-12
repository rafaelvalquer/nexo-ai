import { useEffect, useState } from "react";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider } from "@nexo/shared";

const allCapabilities: ConnectionCapability[] = ["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"];

export function Connections() {
  const [accounts, setAccounts] = useState<ConnectionAccount[]>([]); const [busy, setBusy] = useState<ConnectionProvider | null>(null); const [error, setError] = useState<string | null>(null);
  const reload = () => window.nexo.listConnections().then(setAccounts).catch(e => setError(String(e)));
  useEffect(() => { void reload(); }, []);
  async function connect(provider: ConnectionProvider, capabilities: ConnectionCapability[]) { setBusy(provider); setError(null); try { await window.nexo.connect(provider, capabilities); await reload(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } }
  return <div><header><div><h1>Conexões</h1><p>Conecte contas sem expor tokens ao aplicativo visual.</p></div></header>
    {error && <p className="notice error">{error}</p>}
    <section className="panel list">
      <StaticConnection name="Ollama" detail="IA local" />
      {(["google", "microsoft"] as const).map(provider => <ProviderRow key={provider} provider={provider} account={accounts.find(a => a.provider === provider)} busy={busy === provider} onConnect={connect} reload={reload} />)}
    </section><p className="muted">As contas exigem o Client ID OAuth da organização. O Nexo nunca grava tokens no banco ou os entrega ao Renderer.</p></div>;
}
function ProviderRow({ provider, account, busy, onConnect, reload }: { provider: ConnectionProvider; account?: ConnectionAccount; busy: boolean; onConnect: (provider: ConnectionProvider, capabilities: ConnectionCapability[]) => Promise<void>; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<ConnectionCapability[]>(["email.read", "calendar.read"]); const title = provider === "google" ? "Google" : "Microsoft";
  return <div className="row providerRow"><div><b>{title}</b><span>{account?.accountEmail ?? account?.lastError ?? "E-mail e calendário com OAuth no navegador padrão"}</span>{account ? <small>{account.capabilities.join(" · ")}</small> : <div className="capabilities">{allCapabilities.map(capability => <label key={capability}><input type="checkbox" checked={selected.includes(capability)} onChange={() => setSelected(current => current.includes(capability) ? current.filter(x => x !== capability) : [...current, capability])} />{capability}</label>)}</div>}</div><div className="rowActions"><span className={`tag ${account?.status === "connected" ? "success" : "pending"}`}>{account?.status === "connected" ? "conectado" : "não configurado"}</span>{account ? <button onClick={() => void window.nexo.disconnect(account.id).then(reload)}>Desconectar</button> : <button onClick={() => void onConnect(provider, selected)} disabled={busy || !selected.length}>{busy ? "Abrindo…" : `Conectar ${title}`}</button>}</div></div>;
}
function StaticConnection({name,detail}:{name:string;detail:string}) { return <div className="row"><div><b>{name}</b><span>{detail}</span></div><span className="tag success">ativo</span></div>; }
