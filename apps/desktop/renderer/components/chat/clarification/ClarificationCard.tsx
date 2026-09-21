import type {ClarificationOption} from "@nexo/shared";
import {ClarificationOptionButton} from "./ClarificationOptionButton";
import {EntitySelectionCard} from "./EntitySelectionCard";
import "./clarification.css";

export function ClarificationCard({question,options,selectedId,disabled,onSelect}:{question:string;options:ClarificationOption[];selectedId?:string;disabled:boolean;onSelect:(option:ClarificationOption)=>void}){
  return <div className="structuredClarificationCard">
    <p>{question}</p>
    <div className="structuredClarificationOptions">
      {options.map(option=>option.metadata?.path
        ? <EntitySelectionCard key={option.id} option={option} selected={selectedId===option.id} disabled={disabled} onSelect={onSelect}/>
        : <ClarificationOptionButton key={option.id} option={option} selected={selectedId===option.id} disabled={disabled} onSelect={onSelect}/>)}
    </div>
  </div>;
}
