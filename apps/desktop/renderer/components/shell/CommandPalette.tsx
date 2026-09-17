import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAppStore } from "../../stores/app";

type Command = { label:string; keywords:string; page?:string; run?:()=>Promise<void> };
const pages=["Assistente","Macros","Ferramentas","Configurações"];

export function CommandPalette() {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""); const setPage=useAppStore(s=>s.setPage);
  const commands=useMemo<Command[]>(()=>[
    ...pages.map(page=>({label:`Abrir ${page}`,keywords:page,page})),
    {label:"Nova conversa",keywords:"chat assistente nova conversa",page:"Assistente"},
    {label:"Importar documento",keywords:"arquivo word pdf importar",page:"Assistente"},
    {label:"Conectar Google",keywords:"gmail google conta conexão",page:"Configurações"},
    {label:"Conectar Microsoft",keywords:"outlook microsoft conta conexão",page:"Configurações"},
    {label:"Criar macro",keywords:"macro automação agendar rotina",page:"Macros"},
    {label:"Ver ferramentas",keywords:"tools arquivos sistema web",page:"Ferramentas"},
    {label:"Ativar/desativar modo privado",keywords:"privacidade privado",run:async()=>{const current=await window.nexo.getSettings();await window.nexo.updateSettings({privateMode:!current.privateMode});setPage("Configurações");}}
  ],[setPage]);
  const visible=useMemo(()=>commands.filter(command=>`${command.label} ${command.keywords}`.toLowerCase().includes(query.toLowerCase())),[commands,query]);
  const invoke=async(command:Command)=>{if(command.page)setPage(command.page);if(command.run)await command.run();setOpen(false);setQuery("");};
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setOpen(value=>!value);}if(event.key==="Escape")setOpen(false);if(open&&event.key==="Enter"&&visible[0]){event.preventDefault();void invoke(visible[0]);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[open,visible]);
  if(!open)return null;
  return <div className="paletteOverlay" onMouseDown={()=>setOpen(false)}><div className="palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onMouseDown={event=>event.stopPropagation()}><div className="paletteSearch"><Search size={16}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Navegar ou procurar comando…"/></div><div className="paletteList">{visible.map(command=><button key={command.label} className="ghost" onClick={()=>void invoke(command)}><span>{command.label}</span><kbd>↵</kbd></button>)}</div><small>Ctrl+K para abrir · Enter para executar · Esc para fechar</small></div></div>;
}
