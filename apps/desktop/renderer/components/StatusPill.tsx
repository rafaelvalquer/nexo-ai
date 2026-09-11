export function StatusPill({ok,label}:{ok:boolean;label:string}){return <span className={`pill ${ok?'ok':'warn'}`}><span className="dot"></span>{label}</span>}
