export function SubjectInput({value,disabled,onChange}:{value:string;disabled?:boolean;onChange:(value:string)=>void}){
  return <input className="emailComposeTextInput" type="text" maxLength={998} value={value} disabled={disabled} placeholder="Sem assunto" onChange={event=>onChange(event.target.value)}/>;
}
