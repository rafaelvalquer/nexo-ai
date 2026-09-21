import type {ClarificationOption} from "@nexo/shared";

export function ClarificationOptionButton({option,selected,disabled,onSelect}:{option:ClarificationOption;selected:boolean;disabled:boolean;onSelect:(option:ClarificationOption)=>void}){
  return <button type="button" className={`structuredClarificationOption${selected?" selected":""}`} disabled={disabled} aria-pressed={selected} onClick={()=>onSelect(option)}>
    <span className="structuredClarificationOptionTitle">{selected?"✓ ":""}{option.label}</span>
    {option.description?<span className="structuredClarificationOptionDescription">{option.description}</span>:null}
  </button>;
}
