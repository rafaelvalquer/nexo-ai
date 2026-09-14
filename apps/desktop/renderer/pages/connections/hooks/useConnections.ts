import { useCallback,useEffect,useState } from "react";
import type { ConnectionAccount,ConnectionCapability,ConnectionDiagnosticSnapshot,ConnectionProvider } from "@nexo/shared";

type OAuthConfiguration={googleClientId:string;microsoftClientId:string;microsoftTenant:string;googleConfigured:boolean;microsoftConfigured:boolean;googleClientSecretConfigured:boolean};
const empty:OAuthConfiguration={googleClientId:"",microsoftClientId:"",microsoftTenant:"common",googleConfigured:false,microsoftConfigured:false,googleClientSecretConfigured:false};
export function useConnections(){
  const[accounts,setAccounts]=useState<ConnectionAccount[]>([]),[configuration,setConfiguration]=useState<OAuthConfiguration>(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState<ConnectionProvider|"settings"|"secret"|null>(null),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const reload=useCallback(async()=>{const[next,config]=await Promise.all([window.nexo.listConnections(),window.nexo.getConnectionConfiguration()]);setAccounts(next);setConfiguration(config);setLoading(false);},[]);
  useEffect(()=>{void reload().catch(error=>{setError(text(error));setLoading(false);});},[reload]);
  const run=useCallback(async<T,>(key:ConnectionProvider|"settings"|"secret",task:()=>Promise<T>)=>{setBusy(key);setError(null);setNotice(null);try{return await task();}catch(error){setError(text(error));throw error;}finally{setBusy(null);}},[]);
  return {accounts,configuration,setConfiguration,loading,busy,error,notice,setError,setNotice,reload,
    async connect(provider:ConnectionProvider,capabilities:ConnectionCapability[]){const account=await run(provider,()=>window.nexo.connect(provider,capabilities) as Promise<ConnectionAccount>);await reload();const failed=account.capabilityGrants?.filter(grant=>grant.requested&&!grant.validated).map(grant=>grant.capability)??[];setNotice(account.status==="degraded"?`${providerLabel(provider)} conectado parcialmente. Ativas: ${account.capabilities.join(", ")||"nenhuma"}. Pendentes: ${failed.join(", ")||"revise as permissões"}. Abra Gerenciar conexão para reautorizar.`:`${providerLabel(provider)} conectado e validado.`);return account;},
    async test(provider:ConnectionProvider,id:string){await run(provider,()=>window.nexo.testConnection(id));await reload();setNotice("Conexão validada com sucesso.");},
    async updateCapabilities(provider:ConnectionProvider,id:string,capabilities:ConnectionCapability[]){await run(provider,()=>window.nexo.setConnectionCapabilities(id,capabilities));await reload();setNotice("Permissões atualizadas e reconciliadas.");},
    async disconnect(provider:ConnectionProvider,id:string){await run(provider,()=>window.nexo.disconnect(id));await reload();setNotice(`${providerLabel(provider)} desconectado.`);},
    async diagnostics(id:string){return await run("settings",()=>window.nexo.connectionDiagnostics(id) as Promise<ConnectionDiagnosticSnapshot>);},
    async saveOAuth(secret:string){const config=await run("settings",()=>window.nexo.saveConnectionConfiguration({...configuration,googleClientSecret:secret.trim()||undefined}));setConfiguration(config);setNotice("Configuração OAuth salva com segurança.");return config;},
    async removeGoogleSecret(){await run("secret",()=>window.nexo.deleteGoogleClientSecret());await reload();setNotice("Client Secret removido. As contas Google precisam ser reautorizadas.");}
  };
}
function text(value:unknown){return value instanceof Error?value.message:String(value);}
function providerLabel(provider:ConnectionProvider){return provider==="google"?"Google":"Microsoft";}
