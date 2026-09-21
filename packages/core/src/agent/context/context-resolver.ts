import type {ContextEvidence} from "../decision/types.js";
import type {ContextSnapshot,ResolvedContextEntity} from "./context-snapshot.js";
export type ResolvedContextReference={kind:"file"|"email"|"event"|"page";id?:string;path?:string;url?:string;ordinal?:number;confidence:number};
export type ContextResolution={entities:Record<string,{value:unknown;source:ContextEvidence["source"];confidence:number}>;evidence:ContextEvidence[];unresolved:string[];resolvedReferences:ResolvedContextReference[]};
export class ContextResolver{
  resolve(text:string,snapshot?:ContextSnapshot):ContextResolution{
    if(!snapshot)return{entities:{},evidence:[],unresolved:[],resolvedReferences:[]};
    const entities:ContextResolution["entities"]={},evidence:ContextEvidence[]=[],unresolved:string[]=[],resolvedReferences:ResolvedContextReference[]=[];
    const ordinal=ordinalIndex(text);
    const reference=/\b(ele|ela|isso|esse|essa|este|esta|arquivo|e-?mail|not[ií]cia|p[aá]gina|anterior|mesm[oa]|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|[uú]ltim[oa])\b/i.test(text)||ordinal!==undefined;
    if(!reference)return{entities,evidence,unresolved,resolvedReferences};
    const valid=snapshot.recentEntities.filter(item=>withinTtl(item));
    const expectedKind=/\be-?mail\b/i.test(text)?"email":/\b(?:not[ií]cia|p[aá]gina)\b/i.test(text)?"page":/\b(?:arquivo|documento)\b/i.test(text)?"file":undefined;
    const preferred=expectedKind?valid.filter(item=>item.kind===expectedKind):valid;
    const previous=preferred.filter(item=>item.source==="previous_result");
    let candidate:ResolvedContextEntity|undefined;
    if(ordinal!==undefined){
      const rows=previous.length?previous:preferred;
      candidate=ordinal===-1?rows.at(-1):rows[ordinal];
    }else candidate=previous[0]??preferred[0];
    if(candidate){
      const field=candidate.kind==="email"?"messageId":candidate.kind==="event"?"eventId":candidate.kind==="document"?"documentId":candidate.kind==="page"?"url":"path";
      entities[field]={value:candidate.path??candidate.id,source:candidate.source,confidence:candidate.confidence};
      evidence.push({field,value:candidate.path??candidate.id,source:candidate.source,confidence:candidate.confidence,turnAge:candidate.turnAge});
      if(["file","email","event","page"].includes(candidate.kind))resolvedReferences.push({kind:candidate.kind as ResolvedContextReference["kind"],id:candidate.id,path:candidate.path,...(candidate.kind==="page"?{url:candidate.id}:{}),ordinal:candidate.ordinal,confidence:candidate.confidence});
    }else unresolved.push(ordinal!==undefined?"ordinal_reference":"entity_reference");
    if(/\b(mesma pasta|na mesma pasta)\b/i.test(text)){
      const file=valid.find(item=>item.path);
      if(file?.path){const folder=file.path.replace(/[\\/][^\\/]+$/,"");entities.folder={value:folder,source:file.source,confidence:.9};evidence.push({field:"folder",value:folder,source:file.source,confidence:.9,turnAge:file.turnAge});}
    }
    return{entities,evidence,unresolved,resolvedReferences};
  }
}
function withinTtl(item:ResolvedContextEntity){return item.source==="previous_result"?item.turnAge<=2:item.source==="entity_ledger"?item.turnAge<=5:true;}
function ordinalIndex(text:string){const value=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();const words:[RegExp,number][]=[[/\bprimeir[oa]\b/,0],[/\bsegund[oa]\b/,1],[/\bterceir[oa]\b/,2],[/\bquart[oa]\b/,3],[/\bquint[oa]\b/,4],[/\bultim[oa]\b/,-1]];for(const [pattern,index] of words)if(pattern.test(value))return index;const number=value.match(/\b(\d+)(?:o|a|º|ª)?\b/);return number?Math.max(0,Number(number[1])-1):undefined;}
