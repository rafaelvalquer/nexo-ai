export function EmailBodyEditor({value,disabled,onChange}:{value:string;disabled?:boolean;onChange:(value:string)=>void}){
  return <textarea className="emailComposeBody" rows={8} value={value} disabled={disabled} placeholder="Digite a mensagem..." onChange={event=>onChange(event.target.value)}/>;
}
