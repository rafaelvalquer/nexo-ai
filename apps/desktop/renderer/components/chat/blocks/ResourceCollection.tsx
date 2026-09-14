import { useState } from "react";
import type { ChatActionOutcome,ChatActionRequest,ResourceAction,ResourceCollectionBlock,ResourceItem } from "@nexo/shared";
import { useAssistantStore } from "../../../stores/assistant";
import { ResourceActions } from "./ResourceActions";
import { ActionForm } from "./ActionForm";
import { EmailCard } from "./email/EmailCard";
import { ReplyComposer } from "./email/ReplyComposer";
import { FileCard } from "./filesystem/FileCard";
import { FolderCard } from "./filesystem/FolderCard";
import { CalendarCard } from "./calendar/CalendarCard";
import { GenericResourceCard } from "./generic/GenericResourceCard";

type Reference={conversationId:string;messageId:string;blockId:string};
export function ResourceCollection({block,conversationId,messageId}:{block:ResourceCollectionBlock;conversationId?:string;messageId?:string}) {
  const [selected,setSelected]=useState<string[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const execute=useAssistantStore(store=>store.executeResourceAction),loadMore=useAssistantStore(store=>store.loadMoreBlock),limit=useAssistantStore(store=>store.blockLimits[block.id]??8);
  const reference=conversationId&&messageId?{conversationId,messageId,blockId:block.id}:undefined;
  const chosen=block.items.filter(item=>selected.includes(item.id));
  const common=chosen[0]?.actions.filter(action=>/^email\.(trash|archive|mark_read|mark_unread)$/.test(action.id)&&chosen.every(item=>item.actions.some(other=>other.id===action.id&&!other.disabled)&&!item.pendingApprovalId))??[];
  async function bulk(action:ResourceAction){if(!reference||!chosen.length)return;setLoading(true);setError("");try{await execute({...reference,itemId:chosen[0].id,itemIds:chosen.map(item=>item.id),actionId:action.id});setSelected([]);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setLoading(false);}}
  return <section className="resourceCollection" aria-label={block.title}>
    <header className="resourceCollectionHeading"><div><h3>{block.title}</h3>{block.subtitle&&<p>{block.subtitle}</p>}</div><span>{Math.min(limit,block.items.length)} exibidos{block.total!==undefined?` de ${Math.max(block.total,block.items.length)}`:""}</span></header>
    {chosen.length>0&&<div className="resourceBulkBar" role="group" aria-label="Ações dos e-mails selecionados"><span>{chosen.length} selecionados</span>{common.map(action=><button type="button" key={action.id} disabled={loading} onClick={()=>void bulk(action)}>{action.label}</button>)}<button type="button" onClick={()=>setSelected([])}>Limpar seleção</button></div>}
    {block.items.slice(0,limit).map(item=><ResourceEntry key={item.id} item={item} reference={reference} selected={selected.includes(item.id)} onSelect={value=>setSelected(ids=>value?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>)}
    {!block.items.length&&<p className="resourceEmpty">Nenhum item encontrado.</p>}
    {(block.items.length>limit||block.pagination?.hasMore)&&reference&&<button className="resourceLoadMore" disabled={loading} onClick={async()=>{setLoading(true);setError("");try{await loadMore(reference.conversationId,reference.messageId,block.id);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setLoading(false);}}}>{loading?"Carregando…":"Mostrar mais"}</button>}
    {error&&<p className="chatError" role="alert">{error}</p>}
  </section>;
}
function ResourceEntry({item,reference,selected,onSelect}:{item:ResourceItem;reference?:Reference;selected:boolean;onSelect:(value:boolean)=>void}) {
  const execute=useAssistantStore(store=>store.executeResourceAction),[form,setForm]=useState<string>(),[expanded,setExpanded]=useState(false),[preview,setPreview]=useState<ChatActionOutcome["preview"]>(),[error,setError]=useState("");
  const resource=item.resource;
  async function run(actionId:string,values?:ChatActionRequest["values"]){if(!reference)return;setError("");try{const result=await execute({...reference,itemId:item.id,actionId,values});if(result.preview)setPreview(result.preview);if(actionId==="email.expand")setExpanded(true);setForm(undefined);}catch(error){setError(error instanceof Error?error.message:String(error));throw error;}}
  function action(action:ResourceAction){if(["email.reply","file.rename","file.move","folder.search","calendar.edit","calendar.rsvp"].includes(action.id)){setForm(action.id);return;}if(action.id==="email.expand"&&expanded){setExpanded(false);return;}void run(action.id).catch(()=>{});}
  const children=<>{reference&&<ResourceActions item={item} onAction={action}/>}
    {expanded&&resource.kind==="email"&&<div className="resourceDetails"><p>{resource.bodyText||"Esta mensagem não contém corpo em texto."}</p>{Boolean(resource.attachments?.length)&&<ul aria-label="Anexos">{resource.attachments!.map(attachment=><li key={attachment.id}>{attachment.name}{attachment.size===undefined?"":` · ${attachment.size} B`}</li>)}</ul>}<button type="button" onClick={()=>setExpanded(false)}>Recolher mensagem</button></div>}
    {preview&&<div className="resourceDetails" onKeyDown={event=>{if(event.key==="Escape")setPreview(undefined);}}>{preview.kind==="text"?<pre>{preview.content}</pre>:preview.kind==="image"?<img src={preview.content} alt={resource.kind==="file"?resource.name:"Prévia do arquivo"}/>:<iframe title="Prévia do PDF" src={preview.content}/>}<button type="button" onClick={()=>setPreview(undefined)}>Fechar prévia</button></div>}
    {form==="email.reply"&&resource.kind==="email"?<ReplyComposer recipient={resource.sender.name??resource.sender.email} onCancel={()=>setForm(undefined)} onSubmit={bodyText=>run(form,{bodyText})}/>:form&&<ActionForm actionId={form} item={item} onCancel={()=>setForm(undefined)} onSubmit={values=>run(form,values)}/>}
    {error&&<p className="chatError" role="alert">{error}</p>}
  </>;
  if(resource.kind==="email")return <EmailCard item={item} resource={resource} onExpand={()=>action({id:"email.expand",icon:"more",label:"Ver mensagem",mutation:false})} selected={selected} onSelect={reference&&!item.pendingApprovalId&&!item.actions.every(action=>action.disabled)?onSelect:undefined}>{children}</EmailCard>;
  if(resource.kind==="file")return <FileCard item={item} resource={resource} onExpand={()=>void run("file.preview").catch(()=>{})}>{children}</FileCard>;
  if(resource.kind==="folder")return <FolderCard item={item} resource={resource} onExpand={()=>void run("folder.list").catch(()=>{})}>{children}</FolderCard>;
  if(resource.kind==="calendar")return <CalendarCard item={item} resource={resource}>{children}</CalendarCard>;
  return resource.kind==="generic"?<GenericResourceCard item={item} resource={resource}/>:null;
}
