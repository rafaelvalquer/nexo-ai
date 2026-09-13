import { useEffect, useMemo, useState } from "react";
import type { ConnectionAccount, ConnectionCapability, ConnectionProvider } from "@nexo/shared";

const allCapabilities:ConnectionCapability[]=["email.read","email.send","email.modify","calendar.read","calendar.write"];
const capabilityLabels:Record<ConnectionCapability,string>={
  "email.read":"Ler e-mails",
  "email.send":"Enviar e-mails",
  "email.modify":"Alterar e-mails",
  "calendar.read":"Ler agenda",
  "calendar.write":"Alterar agenda"
};
const googleScopeByCapability:Record<ConnectionCapability,string>={
  "email.read":"https://www.googleapis.com/auth/gmail.readonly",
  "email.send":"https://www.googleapis.com/auth/gmail.send",
  "email.modify":"https://www.googleapis.com/auth/gmail.modify",
  "calendar.read":"https://www.googleapis.com/auth/calendar.readonly",
  "calendar.write":"https://www.googleapis.com/auth/calendar"
};
type OAuthConfiguration={googleClientId:string;microsoftClientId:string;microsoftTenant:string;googleConfigured:boolean;microsoftConfigured:boolean;googleClientSecretConfigured:boolean};
const emptyConfiguration:OAuthConfiguration={googleClientId:"",microsoftClientId:"",microsoftTenant:"common",googleConfigured:false,microsoftConfigured:false,googleClientSecretConfigured:false};

export function Connections(){
  const[accounts,setAccounts]=useState<ConnectionAccount[]>([]);
  const[configuration,setConfiguration]=useState<OAuthConfiguration>(emptyConfiguration);
  const[googleClientSecret,setGoogleClientSecret]=useState("");
  const[showGoogleSecret,setShowGoogleSecret]=useState(false);
  const[busy,setBusy]=useState<ConnectionProvider|"settings"|"secret"|null>(null);
  const[error,setError]=useState<string|null>(null);
  const[notice,setNotice]=useState<string|null>(null);
  const[googleCapabilities,setGoogleCapabilities]=useState<ConnectionCapability[]>(["email.read"]);

  const reload=async()=>{const[nextAccounts,nextConfiguration]=await Promise.all([window.nexo.listConnections(),window.nexo.getConnectionConfiguration()]);setAccounts(nextAccounts);setConfiguration(nextConfiguration);};
  useEffect(()=>{void reload().catch(e=>setError(errorText(e)));},[]);

  async function saveConfiguration(){
    setBusy("settings");setError(null);setNotice(null);
    try{
      const next=await window.nexo.saveConnectionConfiguration({googleClientId:configuration.googleClientId,googleClientSecret:googleClientSecret.trim()||undefined,microsoftClientId:configuration.microsoftClientId,microsoftTenant:configuration.microsoftTenant});
      setConfiguration(next);setGoogleClientSecret("");setShowGoogleSecret(false);setNotice("Configuração OAuth salva. O Client Secret do Google foi armazenado criptografado neste computador.");
    }catch(e){setError(errorText(e));}finally{setBusy(null);}
  }

  async function removeGoogleSecret(){
    if(!window.confirm("Remover o Client Secret do Google? As contas Google conectadas precisarão ser autorizadas novamente."))return;
    setBusy("secret");setError(null);setNotice(null);
    try{await window.nexo.deleteGoogleClientSecret();await reload();setNotice("Client Secret removido. Configure uma nova credencial antes de reconectar o Google.");}
    catch(e){setError(errorText(e));}finally{setBusy(null);}
  }

  async function connect(provider:ConnectionProvider,capabilities:ConnectionCapability[]){setBusy(provider);setError(null);setNotice(null);try{const account=await window.nexo.connect(provider,capabilities) as ConnectionAccount;await reload();const rejected=capabilities.filter(capability=>!account.capabilities.includes(capability));setNotice(rejected.length?`Google conectado parcialmente. Ativadas: ${account.capabilities.map(capability=>capabilityLabels[capability]).join(", ")}. Pendentes: ${rejected.map(capability=>capabilityLabels[capability]).join(", ")}. Use “Gerenciar permissões” para reautorizar.`:`${provider==="google"?"Google":"Microsoft"} conectado e validado.`);}catch(e){setError(errorText(e));}finally{setBusy(null);}}
  async function testConnection(provider:ConnectionProvider,id:string){setBusy(provider);setError(null);setNotice(null);try{await window.nexo.testConnection(id);await reload();setNotice("Conexão validada com sucesso, incluindo as APIs autorizadas.");}catch(e){setError(errorText(e));await reload().catch(()=>undefined);}finally{setBusy(null);}}
  async function addCapabilities(provider:ConnectionProvider,id:string,capabilities:ConnectionCapability[]){if(!capabilities.length)return;setBusy(provider);setError(null);setNotice(null);try{await window.nexo.addConnectionCapabilities(id,capabilities);await reload();setNotice("Permissões atualizadas e validadas.");}catch(e){setError(errorText(e));await reload().catch(()=>undefined);}finally{setBusy(null);}}

  return <div>
    <header><div><h1>Conexões</h1><p>Configure as credenciais OAuth e mantenha suas contas conectadas com tokens criptografados e renovação automática.</p></div></header>
    {error&&<p className="notice error">{error}</p>}
    {notice&&<p className="notice success">{notice}</p>}

    <section className="panel settings oauthSetup">
      <h3>Google OAuth</h3>
      <p className="muted">O Client ID fica nas configurações locais. O Client Secret é enviado ao processo principal e armazenado com a criptografia segura do sistema; ele não é devolvido ao React depois de salvo.</p>
      <label>Client ID do Google<input value={configuration.googleClientId} placeholder="…apps.googleusercontent.com" onChange={event=>setConfiguration(current=>({...current,googleClientId:event.target.value}))}/></label>
      <label>Client Secret do Google
        <div className="secretInputRow">
          <input type={showGoogleSecret?"text":"password"} value={googleClientSecret} placeholder={configuration.googleClientSecretConfigured?"Client Secret já armazenado — deixe em branco para manter":"GOCSPX-…"} onChange={event=>setGoogleClientSecret(event.target.value)} autoComplete="new-password"/>
          <button type="button" onClick={()=>setShowGoogleSecret(value=>!value)} disabled={!googleClientSecret}>{showGoogleSecret?"Ocultar":"Mostrar"}</button>
        </div>
      </label>
      <p className="muted">{configuration.googleClientSecretConfigured?"✓ Client Secret armazenado com segurança neste computador.":"Client Secret ainda não configurado."}</p>
      <div className="rowActions">
        <button onClick={()=>void saveConfiguration()} disabled={busy!==null}>{busy==="settings"?"Salvando…":"Salvar credenciais"}</button>
        {configuration.googleClientSecretConfigured&&<button onClick={()=>void removeGoogleSecret()} disabled={busy!==null}>{busy==="secret"?"Removendo…":"Remover Client Secret"}</button>}
      </div>
      <div className="oauthHelp"><b>Antes de conectar</b><ul><li>Crie um cliente OAuth do tipo aplicativo para computador.</li><li>Habilite a Gmail API e, se usar agenda, a Google Calendar API.</li><li>Em ambiente de teste, inclua sua conta em Usuários de teste.</li></ul></div>
      <GooglePermissions capabilities={googleCapabilities}/>
    </section>

    <section className="panel settings oauthSetup">
      <h3>Microsoft OAuth</h3>
      <label>Client ID do Microsoft<input value={configuration.microsoftClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={event=>setConfiguration(current=>({...current,microsoftClientId:event.target.value}))}/></label>
      <label>Tenant Microsoft<input value={configuration.microsoftTenant} placeholder="common" onChange={event=>setConfiguration(current=>({...current,microsoftTenant:event.target.value}))}/></label>
      <button onClick={()=>void saveConfiguration()} disabled={busy!==null}>{busy==="settings"?"Salvando…":"Salvar configuração Microsoft"}</button>
    </section>

    <section className="panel list">
      <StaticConnection name="Ollama" detail="IA local"/>
      {(["google","microsoft"] as const).map(provider=><ProviderRow key={provider} provider={provider} configured={provider==="google"?configuration.googleConfigured:configuration.microsoftConfigured} account={accounts.find(account=>account.provider===provider)} busy={busy===provider} onConnect={connect} onTest={testConnection} onAddCapabilities={addCapabilities} reload={reload} selectedCapabilities={provider==="google"?googleCapabilities:undefined} onSelectedCapabilitiesChange={provider==="google"?setGoogleCapabilities:undefined}/>) }
    </section>
  </div>;
}

function ProviderRow({provider,configured,account,busy,onConnect,onTest,onAddCapabilities,reload,selectedCapabilities,onSelectedCapabilitiesChange}:{provider:ConnectionProvider;configured:boolean;account?:ConnectionAccount;busy:boolean;onConnect:(provider:ConnectionProvider,capabilities:ConnectionCapability[])=>Promise<void>;onTest:(provider:ConnectionProvider,id:string)=>Promise<void>;onAddCapabilities:(provider:ConnectionProvider,id:string,capabilities:ConnectionCapability[])=>Promise<void>;reload:()=>Promise<void>;selectedCapabilities?:ConnectionCapability[];onSelectedCapabilitiesChange?:(capabilities:ConnectionCapability[])=>void}){
  const[localSelected,setLocalSelected]=useState<ConnectionCapability[]>(provider==="google"?["email.read"]:["email.read","calendar.read"]);
  const[managing,setManaging]=useState(false);
  const[extra,setExtra]=useState<ConnectionCapability[]>([]);
  const title=provider==="google"?"Google":"Microsoft";
  const selected=selectedCapabilities??localSelected;
  const setSelected=onSelectedCapabilitiesChange??setLocalSelected;
  const toggleSelected=(capability:ConnectionCapability)=>setSelected(selected.includes(capability)?selected.filter(item=>item!==capability):[...selected,capability]);
  const missing=useMemo(()=>account?(account.requestedCapabilities??account.capabilities).filter(capability=>!account.capabilities.includes(capability)):allCapabilities,[account]);
  const available=useMemo(()=>account?allCapabilities.filter(capability=>!account.capabilities.includes(capability)):[],[account]);
  const status=statusPresentation(account,configured);

  useEffect(()=>{if(!account){setManaging(false);setExtra([]);}},[account]);

  async function disconnect(){if(!account)return;if(!window.confirm(`Desconectar ${title}? Os tokens salvos para esta conta serão removidos deste computador.`))return;await window.nexo.disconnect(account.id);await reload();}
  async function reauthorize(){if(!account)return;const capabilities=account.requestedCapabilities?.length?account.requestedCapabilities:account.capabilities;if(!capabilities.length)return;await onAddCapabilities(provider,account.id,capabilities);}

  return <div className="row providerRow">
    <div>
      <b>{title}</b>
      <span>{account?.accountEmail??account?.lastError??(configured?"Pronto para autorizar no navegador padrão":"Credenciais OAuth ainda não configuradas")}</span>
      {account?<>
        <div className="capabilities grantedCapabilities">{allCapabilities.map(capability=><span key={capability}>{account.capabilities.includes(capability)?"✓":"○"} {capabilityLabels[capability]}</span>)}</div>
        {account.lastValidatedAt&&<small>Última validação: {new Date(account.lastValidatedAt).toLocaleString("pt-BR")}</small>}
        {account.lastRefreshAt&&<small> · Última renovação: {new Date(account.lastRefreshAt).toLocaleString("pt-BR")}</small>}
        {account.reauthorizationReason&&<small className="notice error">{account.reauthorizationReason}</small>}
        {missing.length>0&&<small className="notice error">Permissões pendentes: {missing.map(capability=>capabilityLabels[capability]).join(", ")}. Reautorize após corrigir o Google Cloud.</small>}
        {managing&&available.length>0&&<div className="capabilities"><b>Adicionar ou reautorizar permissões</b>{available.map(capability=><label key={capability}><input type="checkbox" checked={extra.includes(capability)} onChange={()=>setExtra(current=>current.includes(capability)?current.filter(item=>item!==capability):[...current,capability])}/>{capabilityLabels[capability]}</label>)}<button disabled={busy||!extra.length} onClick={()=>void onAddCapabilities(provider,account.id,extra).then(()=>{setManaging(false);setExtra([]);})}>{busy?"Autorizando…":"Autorizar selecionadas"}</button></div>}
      </>:<div className="capabilities">{allCapabilities.map(capability=><label key={capability}><input type="checkbox" checked={selected.includes(capability)} onChange={()=>toggleSelected(capability)}/>{capabilityLabels[capability]}</label>)}</div>}
    </div>
    <div className="rowActions">
      <span className={`tag ${status.success?"success":"pending"}`}>{status.label}</span>
      {account?<>
        <button onClick={()=>void onTest(provider,account.id)} disabled={busy}>{busy?"Testando…":"Testar"}</button>
        {available.length>0&&<button onClick={()=>setManaging(value=>!value)} disabled={busy}>{managing?"Cancelar permissões":"Gerenciar permissões"}</button>}
        {(account.status==="reauthorization-required"||account.status==="expired")&&<button onClick={()=>void reauthorize()} disabled={busy||!configured}>{busy?"Abrindo…":"Reautorizar"}</button>}
        <button onClick={()=>void disconnect()} disabled={busy}>Desconectar</button>
      </>:<button onClick={()=>void onConnect(provider,selected)} disabled={busy||!configured||!selected.length}>{busy?"Abrindo…":configured?`Conectar ${title}`:"Configure as credenciais"}</button>}
    </div>
  </div>;
}

function GooglePermissions({capabilities}:{capabilities:ConnectionCapability[]}){
  const[copied,setCopied]=useState<string|null>(null);
  const scopes=[...new Set(capabilities.map(capability=>googleScopeByCapability[capability]))];
  async function copy(scope:string){try{await navigator.clipboard.writeText(scope);setCopied(scope);}catch{setCopied(null);}}
  return <div className="oauthHelp googlePermissions"><b>Permissões necessárias no Google Cloud</b><p>Em Google Cloud → Google Auth Platform → Data Access, adicione os escopos selecionados abaixo.</p>{scopes.map(scope=><div className="scopeRow" key={scope}><code>{scope}</code><button type="button" onClick={()=>void copy(scope)}>{copied===scope?"Copiado":"Copiar"}</button></div>)}<ul><li>Para Gmail, habilite a <b>Gmail API</b>.</li>{capabilities.some(capability=>capability.startsWith("calendar"))&&<li>Para agenda, habilite a <b>Google Calendar API</b>.</li>}<li>Se o app estiver em <b>Testing</b>, inclua a conta em <b>Test users</b>.</li><li>Após mudar Data Access ou Test users, revogue o acesso do Nexo na Conta Google e reautorize.</li></ul></div>;
}

function statusPresentation(account:ConnectionAccount|undefined,configured:boolean){
  if(!account)return{label:configured?"pronto":"configurar",success:configured};
  if(account.status==="connected")return{label:"conectado",success:true};
  if(account.status==="refreshing")return{label:"renovando",success:false};
  if(account.status==="validating")return{label:"validando",success:false};
  if(account.status==="expired")return{label:"expirado",success:false};
  if(account.status==="reauthorization-required")return{label:"reautorizar",success:false};
  return{label:"atenção",success:false};
}
function errorText(value:unknown){return value instanceof Error?value.message:String(value);}
function StaticConnection({name,detail}:{name:string;detail:string}){return <div className="row"><div><b>{name}</b><span>{detail}</span></div><span className="tag success">ativo</span></div>;}
