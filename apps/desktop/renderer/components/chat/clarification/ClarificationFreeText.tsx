export function ClarificationFreeText({value,placeholder,disabled,multiline,onChange}:{value:string;placeholder?:string;disabled:boolean;multiline?:boolean;onChange:(value:string)=>void}){
  return multiline
    ? <textarea className="structuredClarificationFreeText" rows={5} value={value} placeholder={placeholder} disabled={disabled} onChange={event=>onChange(event.target.value)}/>
    : <input className="structuredClarificationFreeText" value={value} placeholder={placeholder} disabled={disabled} onChange={event=>onChange(event.target.value)}/>;
}
