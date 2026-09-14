import { useEffect,useState } from "react";
export function BrowserAgentProfileSettings(){
  const[enabled,setEnabled]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{void window.nexo.getBrowserPersonalProfileEnabled().then((value:boolean)=>{setEnabled(value);setReady(true);}).catch(error=>{setError(error instanceof Error?error.message:String(error));setReady(true);});},[]);
  async function change(value:boolean){if(busy)return;setBusy(true);setError("");try{const saved=await window.nexo.setBrowserPersonalProfileEnabled(value) as boolean;setEnabled(saved);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setBusy(false);}}
  return <div className="settingBlock"><label className="check"><input type="checkbox" checked={enabled} disabled={!ready||busy} onChange={event=>void change(event.target.checked)}/>Habilitar perfil pessoal do Browser Agent</label><small>Permite reutilizar cookies e sessões autenticadas em um perfil separado. O modo de pesquisa continua usando perfil temporário por padrão.</small>{error&&<small className="chatError">{error}</small>}</div>;
}
