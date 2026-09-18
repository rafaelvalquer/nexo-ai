import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence,motion,useReducedMotion } from "motion/react";
import { ArrowRight,Command as CommandIcon,FileText,Search,Sparkles } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useAssistantStore } from "../../stores/assistant";
import { useToastStore } from "../../stores/toast";
import type { MacroView, ConversationSummary, DocumentRecord } from "@nexo/shared";
import { motionTokens } from "../../design/motion";
import { useDeveloperDiagnosticsEnabled } from "../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../utils/user-facing-error";
import { fuzzyScore } from "../../utils/fuzzy-score";
import { appRoutes } from "../../app-routes";
import "./command-palette.css";

type Command = { label:string; keywords:string; group:string; page?:string; run?:()=>Promise<void> };
export function CommandPalette() {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[selected,setSelected]=useState(0),[recent,setRecent]=useState<string[]>([]),[dynamicCommands,setDynamicCommands]=useState<Command[]>([]),[invoking,setInvoking]=useState(false); const setPage=useAppStore(s=>s.setPage),reduceMotion=useReducedMotion();
  const previousFocus=useRef<HTMLElement|null>(null);
  const commands=useMemo<Command[]>(()=>[
    ...appRoutes.map(page=>({label:`Abrir ${page}`,keywords:page,group:"Navegação",page})),
    {label:"Nova conversa",keywords:"chat assistente nova conversa",group:"Comandos",page:"Assistente",run:async()=>{await useAssistantStore.getState().createSession();}},
    {label:"Importar documento",keywords:"arquivo word pdf importar anexo",group:"Comandos",page:"Assistente",run:async()=>{const store=useAssistantStore.getState();const id=store.activeSessionId||await store.createSession();if(id)await useAssistantStore.getState().attach(id);}},
    {label:"Conectar Google",keywords:"gmail google conta conexão",group:"Comandos",page:"Configurações"},
    {label:"Conectar Microsoft",keywords:"outlook microsoft conta conexão",group:"Comandos",page:"Configurações"},
    {label:"Criar macro",keywords:"macro automação agendar rotina",group:"Comandos",page:"Macros"},
    {label:"Ver ferramentas",keywords:"tools arquivos sistema web",group:"Comandos",page:"Configurações"},
    {label:"Ativar/desativar modo privado",keywords:"privacidade privado",group:"Comandos",run:async()=>{const current=await window.nexo.getSettings();await window.nexo.updateSettings({privateMode:!current.privateMode});setPage("Configurações");}},
    ...dynamicCommands
  ],[dynamicCommands,setPage]);
  const visible=useMemo(()=>commands.map((command,index)=>({command,index,score:fuzzyScore(`${command.label} ${command.keywords}`,query),recentIndex:recent.indexOf(command.label)})).filter(item=>item.score>=0).sort((a,b)=>query.trim()?b.score-a.score||a.index-b.index:(a.recentIndex<0?Infinity:a.recentIndex)-(b.recentIndex<0?Infinity:b.recentIndex)||a.index-b.index).map(item=>item.command),[commands,query,recent]);
  const groups=useMemo(()=>{
    if(query.trim())return visible.length?[{label:"Resultados",commands:visible}]:[];
    const recentCommands=visible.filter(command=>recent.includes(command.label));
    const remaining=visible.filter(command=>!recent.includes(command.label));
    const grouped=new Map<string,Command[]>();
    for(const command of remaining){const items=grouped.get(command.group)??[];items.push(command);grouped.set(command.group,items);}
    return [...(recentCommands.length?[{label:"Recentes",commands:recentCommands}]:[]),...Array.from(grouped,([label,items])=>({label,commands:items}))];
  },[visible,query,recent]);
  const navigationCommands=useMemo(()=>groups.flatMap(group=>group.commands),[groups]);
  useLayoutEffect(()=>{
    if(!open)return;
    const list=document.getElementById("nexo-command-list"),option=document.getElementById(`nexo-command-${selected}`);
    if(!list||!option)return;
    const listRect=list.getBoundingClientRect(),optionRect=option.getBoundingClientRect();
    if(optionRect.top<listRect.top)list.scrollTop-=listRect.top-optionRect.top;
    else if(optionRect.bottom>listRect.bottom)list.scrollTop+=optionRect.bottom-listRect.bottom;
  },[open,selected,navigationCommands.length]);
  const loadRecentCommands=()=>{try{const value=JSON.parse(localStorage.getItem("nexo.command.recent")||"[]");setRecent(Array.isArray(value)?value.filter((item):item is string=>typeof item==="string").slice(0,5):[]);}catch{setRecent([]);}};
  const openPalette=()=>{previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setOpen(true);setQuery("");setSelected(0);loadRecentCommands();};
  const invoke=async(command:Command)=>{if(invoking)return;setInvoking(true);try{if(command.run)await command.run();if(command.page)setPage(command.page);const next=[command.label,...recent.filter(label=>label!==command.label)].slice(0,5);setRecent(next);try{localStorage.setItem("nexo.command.recent",JSON.stringify(next));}catch{}setOpen(false);setQuery("");setSelected(0);}catch(error){useToastStore.getState().show({title:"Não foi possível executar o comando",description:userFacingError(error,"O comando não pôde ser concluído. Tente novamente.",diagnostics),tone:"error"});}finally{setInvoking(false);}};
  useEffect(()=>{if(!open)return;let active=true;const load=<T,>(read:()=>Promise<T>,fallback:T)=>Promise.resolve().then(read).catch(()=>fallback);void Promise.all([load(()=>window.nexo.listMacros?.()??Promise.resolve([]),[]),load(()=>window.nexo.listConversations(),[]),load(()=>window.nexo.listRecentDocuments?.()??Promise.resolve([]),[])]).then(([macros,conversations,documents])=>{if(!active)return;const searchableMacros=(macros as MacroView[]).map(macro=>({label:`Executar macro: ${macro.name}`,keywords:`macro executar ${macro.name} ${macro.description??macro.prompt??""}`,group:"Macros",page:"Macros",run:async()=>{await window.nexo.runMacro(macro.id);}}));const searchableConversations=(conversations as ConversationSummary[]).map(conversation=>({label:`Abrir conversa: ${conversation.title}`,keywords:`conversa chat histórico ${conversation.title}`,group:"Conversas",page:"Assistente",run:async()=>{await useAssistantStore.getState().sync();useAssistantStore.getState().selectSession(conversation.id);}}));const searchableDocuments=(documents as DocumentRecord[]).map(document=>({label:`Abrir documento: ${document.name}`,keywords:`arquivo documento ${document.name} ${document.mimeType}`,group:"Arquivos",page:"Documentos"}));setDynamicCommands([...searchableMacros,...searchableConversations,...searchableDocuments]);});return()=>{active=false;};},[open]);
  useEffect(()=>{if(open)return;const target=previousFocus.current;previousFocus.current=null;target?.focus();},[open]);
  useLayoutEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&(event.key.toLowerCase()==="k"||event.code==="Space")){event.preventDefault();if(open)setOpen(false);else openPalette();return;}if(open&&event.key==="Escape"){event.preventDefault();setOpen(false);return;}if(open&&event.key==="ArrowDown"){event.preventDefault();setSelected(value=>Math.min(value+1,Math.max(navigationCommands.length-1,0)));}if(open&&event.key==="ArrowUp"){event.preventDefault();setSelected(value=>Math.max(0,value-1));}if(open&&event.key==="Enter"&&navigationCommands[selected]){event.preventDefault();void invoke(navigationCommands[selected]);}};window.addEventListener("keydown",key);window.addEventListener("nexo:open-command-palette",openPalette);return()=>{window.removeEventListener("keydown",key);window.removeEventListener("nexo:open-command-palette",openPalette);};},[open,navigationCommands,selected]);
  return <AnimatePresence>{open&&<motion.div className="paletteOverlay" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}} initial={reduceMotion?false:{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduceMotion?0:motionTokens.duration.fast/1000}}><motion.div className="palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onMouseDown={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key!=="Tab")return;const focusable=[...event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]),button:not([disabled])")];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}} initial={reduceMotion?false:{opacity:0,y:-8,scale:motionTokens.scale.popover}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-4,scale:motionTokens.scale.popover}} transition={reduceMotion?{duration:0}:motionTokens.spring.normal}><div className="paletteSearch"><Search size={17} aria-hidden="true"/><input autoFocus role="combobox" aria-label="O que deseja fazer?" aria-autocomplete="list" aria-expanded="true" aria-controls="nexo-command-list" aria-activedescendant={navigationCommands[selected]?`nexo-command-${selected}`:undefined} value={query} onChange={event=>{setQuery(event.target.value);setSelected(0);}} placeholder="O que deseja fazer?"/><kbd>ESC</kbd></div><div id="nexo-command-list" className="paletteList" role="listbox" aria-label="Comandos disponíveis">{navigationCommands.length?groups.map(group=><section className="paletteGroup" role="group" aria-label={group.label} key={group.label}><h3 className="paletteGroupHeading">{group.label}</h3>{group.commands.map(command=>{const index=navigationCommands.indexOf(command);return <div id={`nexo-command-${index}`} key={`${command.group}:${command.label}`} className={`paletteCommand${selected===index?" selected":""}`} role="option" aria-selected={selected===index} aria-disabled={invoking||undefined} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setSelected(index)} onClick={()=>{if(!invoking)void invoke(command);}}><span className="paletteCommandIcon">{command.group==="Macros"?<Sparkles size={15}/>:command.group==="Arquivos"?<FileText size={15}/>:<ArrowRight size={15}/>}</span><span>{command.label}<small>{command.page??"Ação rápida"}</small></span><kbd>↵</kbd></div>;})}</section>):<div className="paletteNoResults" role="status" aria-live="polite">Nenhum comando encontrado.</div>}</div><footer><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span><span className="paletteFooterBrand"><CommandIcon size={12}/> Nexo Command</span></footer></motion.div></motion.div>}</AnimatePresence>;
}
