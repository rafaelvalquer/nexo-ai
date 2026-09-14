import { useState } from "react";
import { X } from "lucide-react";

const EMAIL=/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/;

export function RecipientInput({value,disabled,onChange}:{value:string[];disabled?:boolean;onChange:(value:string[])=>void}){
  const[input,setInput]=useState(""),[error,setError]=useState("");
  function commit(){
    const entries=input.split(/[;,\s]+/).map(item=>item.trim().toLowerCase()).filter(Boolean);
    if(!entries.length)return true;
    const invalid=entries.find(item=>!EMAIL.test(item));
    if(invalid){setError(`${invalid} não é um endereço de e-mail válido.`);return false;}
    onChange([...new Set([...value,...entries])]);setInput("");setError("");return true;
  }
  function remove(email:string){onChange(value.filter(item=>item!==email));setError("");}
  return <div className="emailRecipientControl">
    <div className="emailRecipientChips">
      {value.map(email=><span className="emailRecipientChip" key={email}>{email}<button type="button" aria-label={`Remover ${email}`} disabled={disabled} onClick={()=>remove(email)}><X size={13}/></button></span>)}
      <input type="email" value={input} disabled={disabled} placeholder={value.length?"Adicionar destinatário":"nome@exemplo.com"} onChange={event=>{setInput(event.target.value);setError("");}} onBlur={()=>void commit()} onKeyDown={event=>{if(event.key==="Enter"||event.key===","||event.key===";"){event.preventDefault();commit();}}}/>
    </div>
    {error&&<p className="emailComposeFieldError" role="alert">{error}</p>}
  </div>;
}
