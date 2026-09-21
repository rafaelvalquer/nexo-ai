import type {ClarificationOption} from "@nexo/shared";

export function EntitySelectionCard({option,selected,disabled,onSelect}:{option:ClarificationOption;selected:boolean;disabled:boolean;onSelect:(option:ClarificationOption)=>void}){
  const meta=option.metadata;
  return <button type="button" className={`entitySelectionCard${selected?" selected":""}`} disabled={disabled} aria-pressed={selected} onClick={()=>onSelect(option)}>
    <strong>{selected?"✓ ":""}{option.label}</strong>
    {meta?.path?<span>{meta.path}</span>:option.description?<span>{option.description}</span>:null}
    <small>{[formatBytes(meta?.size),formatModified(meta?.modifiedAt)].filter(Boolean).join(" · ")}</small>
  </button>;
}
function formatBytes(value?:number){if(value===undefined)return"";if(value<1024)return`${value} B`;if(value<1024*1024)return`${(value/1024).toFixed(1)} KB`;return`${(value/1024/1024).toFixed(1)} MB`;}
function formatModified(value?:string){if(!value)return"";const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString("pt-BR");}
