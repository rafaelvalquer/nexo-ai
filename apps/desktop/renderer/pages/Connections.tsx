import { useEffect, useState } from "react";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider } from "@nexo/shared";

const allCapabilities: ConnectionCapability[] = ["email.read", "email.send", "email.modify", "calendar.read", "calendar.write"];
type OAuthConfiguration = { googleClientId: string; microsoftClientId: string; microsoftTenant: string; googleConfigured: boolean; microsoftConfigured: boolean };
const emptyConfiguration: OAuthConfiguration = { googleClientId: "", microsoftClientId: "", microsoftTenant: "common", googleConfigured: false, microsoftConfigured: false };

export function Connections() {
  const [accounts, setAccounts] = useState<ConnectionAccount[]>([]);
  const [configuration, setConfiguration] = useState<OAuthConfiguration>(emptyConfiguration);
  const [busy, setBusy] = useState<ConnectionProvider | "settings" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => { const [nextAccounts, nextConfiguration] = await Promise.all([window.nexo.listConnections(), window.nexo.getConnectionConfiguration()]); setAccounts(nextAccounts); setConfiguration(nextConfiguration); };
  useEffect(() => { void reload().catch(e => setError(e instanceof Error ? e.message : String(e))); }, []);

  async function saveConfiguration() {
    setBusy("settings"); setError(null);
    try { setConfiguration(await window.nexo.saveConnectionConfiguration(configuration)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function connect(provider: ConnectionProvider, capabilities: ConnectionCapability[]) { setBusy(provider); setError(null); try { await window.nexo.connect(provider, capabilities); await reload(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } }
  async function testConnection(provider: ConnectionProvider, id: string) { setBusy(provider); setError(null); try { await window.nexo.testConnection(id); await reload(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } }

  return <div><header><div><h1>Conexões</h1><p>Configure os Client IDs públicos da organização uma vez e conecte contas sem expor tokens ao aplicativo visual.</p></div></header>
    {error && <p className="notice error">{error}</p>}
    <section className="panel settings oauthSetup"><h3>Configuração OAuth da organização</h3><p className="muted">Client IDs identificam o aplicativo, não são segredos. Nunca informe um Client Secret nesta tela.</p>
      <label>Client ID do Google<input value={configuration.googleClientId} placeholder="…apps.googleusercontent.com" onChange={event => setConfiguration(current => ({ ...current, googleClientId: event.target.value }))} /></label>
      <label>Client ID do Microsoft<input value={configuration.microsoftClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={event => setConfiguration(current => ({ ...current, microsoftClientId: event.target.value }))} /></label>
      <label>Tenant Microsoft<input value={configuration.microsoftTenant} placeholder="common" onChange={event => setConfiguration(current => ({ ...current, microsoftTenant: event.target.value }))} /></label>
      <button onClick={() => void saveConfiguration()} disabled={busy !== null}>{busy === "settings" ? "Salvando…" : "Salvar configuração OAuth"}</button>
      <div className="oauthHelp"><b>Antes de conectar</b><ul><li>Google: crie um cliente OAuth de desktop, habilite Gmail e Calendar APIs e configure a tela de consentimento.</li><li>Microsoft: registre aplicativo multitenant, habilite fluxo de cliente público e use <code>http://localhost</code> como redirect desktop.</li><li>Para Google em teste, inclua os usuários autorizados na tela de consentimento.</li></ul></div>
    </section>
    <section className="panel list"><StaticConnection name="Ollama" detail="IA local" />
      {(["google", "microsoft"] as const).map(provider => <ProviderRow key={provider} provider={provider} configured={provider === "google" ? configuration.googleConfigured : configuration.microsoftConfigured} account={accounts.find(a => a.provider === provider)} busy={busy === provider} onConnect={connect} onTest={testConnection} reload={reload} />)}
    </section></div>;
}
function ProviderRow({ provider, configured, account, busy, onConnect, onTest, reload }: { provider: ConnectionProvider; configured: boolean; account?: ConnectionAccount; busy: boolean; onConnect: (provider: ConnectionProvider, capabilities: ConnectionCapability[]) => Promise<void>; onTest: (provider: ConnectionProvider, id: string) => Promise<void>; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<ConnectionCapability[]>(["email.read", "calendar.read"]); const title = provider === "google" ? "Google" : "Microsoft";
  return <div className="row providerRow"><div><b>{title}</b><span>{account?.accountEmail ?? account?.lastError ?? (configured ? "Pronto para autorizar no navegador padrão" : "Client ID OAuth ainda não configurado")}</span>{account ? <small>{account.capabilities.join(" · ")}{account.lastValidatedAt ? ` · testado ${new Date(account.lastValidatedAt).toLocaleString("pt-BR")}` : ""}</small> : <div className="capabilities">{allCapabilities.map(capability => <label key={capability}><input type="checkbox" checked={selected.includes(capability)} onChange={() => setSelected(current => current.includes(capability) ? current.filter(x => x !== capability) : [...current, capability])} />{capability}</label>)}</div>}</div><div className="rowActions"><span className={`tag ${account?.status === "connected" || (!account && configured) ? "success" : "pending"}`}>{account?.status === "connected" ? "conectado" : configured ? "pronto" : "configurar"}</span>{account ? <><button onClick={() => void onTest(provider, account.id)} disabled={busy}>{busy ? "Testando…" : "Testar"}</button><button onClick={() => void window.nexo.disconnect(account.id).then(reload)} disabled={busy}>Desconectar</button></> : <button onClick={() => void onConnect(provider, selected)} disabled={busy || !configured || !selected.length}>{busy ? "Abrindo…" : configured ? `Conectar ${title}` : "Configure o Client ID"}</button>}</div></div>;
}
function StaticConnection({name,detail}:{name:string;detail:string}) { return <div className="row"><div><b>{name}</b><span>{detail}</span></div><span className="tag success">ativo</span></div>; }
