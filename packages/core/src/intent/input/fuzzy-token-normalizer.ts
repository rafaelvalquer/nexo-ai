import {STRUCTURAL_TOKENS,fold} from "./intent-lexicon.js";
import type {ProtectedSpan} from "./literal-span-extractor.js";

export type FuzzyCorrection={from:string;to:string;start:number;end:number};

export function normalizeStructuralTypos(text:string,protectedSpans:ProtectedSpan[]){
  const corrections:FuzzyCorrection[]=[];
  const token=/[\p{L}]+/gu;
  const output=text.replace(token,(raw:string,offset:number)=>{
    const end=offset+raw.length;
    if(protectedSpans.some(span=>offset<span.end&&end>span.start))return raw;
    const normalized=fold(raw);
    if(STRUCTURAL_TOKENS.includes(normalized))return raw;
    let best:string|undefined,bestDistance=Number.POSITIVE_INFINITY;
    for(const candidate of STRUCTURAL_TOKENS){
      const max=normalized.length<=5?1:2;
      if(Math.abs(candidate.length-normalized.length)>max)continue;
      const distance=levenshtein(normalized,candidate,max);
      if(distance<bestDistance){bestDistance=distance;best=candidate;}
    }
    const allowed=normalized.length<=5?1:2;
    if(!best||bestDistance>allowed)return raw;
    corrections.push({from:raw,to:best,start:offset,end});
    return preserveCase(raw,best);
  });
  return{text:output,corrections};
}
function levenshtein(a:string,b:string,cutoff:number){
  if(a===b)return 0;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const current=[i];let rowMin=i;
    for(let j=1;j<=b.length;j++){
      const value=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
      current[j]=value;rowMin=Math.min(rowMin,value);
    }
    if(rowMin>cutoff)return cutoff+1;
    previous=current;
  }
  return previous[b.length];
}
function preserveCase(source:string,target:string){return /^[A-ZÁÉÍÓÚ]/u.test(source)?target[0].toUpperCase()+target.slice(1):target;}
