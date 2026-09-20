import type {NormalizedIntentLiteralSegment} from "../types.js";

export type ProtectedSpan={start:number;end:number;kind:"quoted"|"path"|"filename"|"url"|"email"|"content"};

const QUOTED=/["“”']([^"“”']+)["“”']/gu;
const WINDOWS_PATH=/\b[A-Za-z]:[\\/][^\n,;]+/gu;
const UNC_PATH=/\\\\[^\s]+(?:\\[^\s]+)*/gu;
const POSIX_PATH=/(?:^|\s)(\/[^\s,;]+)/gu;
const URL=/https?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/giu;
const EMAIL=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const FILENAME=/\b[^\s\\/:*?"<>|]+\.[A-Za-z0-9]{1,12}\b/gu;
const EDIT_VERB=/\b(?:edite|editar|altere|alterar|troque|mude|mudar|modifique|modificar|substitua|escreva|escrever)\b/iu;

export function extractLiteralSpans(original:string){
  const literalSegments:NormalizedIntentLiteralSegment[]=[];
  const protectedSpans:ProtectedSpan[]=[];
  const explicitPaths:string[]=[];
  for(const match of original.matchAll(QUOTED)){
    const value=match[1]??"";const offset=(match.index??0)+match[0].indexOf(value);
    literalSegments.push({type:"quoted",value,start:offset,end:offset+value.length});
    protectedSpans.push({kind:"quoted",start:offset,end:offset+value.length});
  }
  for(const regex of [WINDOWS_PATH,UNC_PATH]){
    for(const match of original.matchAll(regex)){
      const value=match[0].trim(),start=(match.index??0)+match[0].indexOf(value);
      explicitPaths.push(value);literalSegments.push({type:"path",value,start,end:start+value.length});
      protectedSpans.push({kind:"path",start,end:start+value.length});
    }
  }
  for(const match of original.matchAll(POSIX_PATH)){
    const value=(match[1]??"").trim();if(!value)continue;
    const start=(match.index??0)+match[0].lastIndexOf(value);
    explicitPaths.push(value);literalSegments.push({type:"path",value,start,end:start+value.length});
    protectedSpans.push({kind:"path",start,end:start+value.length});
  }
  addProtected(original,URL,"url",protectedSpans);
  addProtected(original,EMAIL,"email",protectedSpans);
  addProtected(original,FILENAME,"filename",protectedSpans);
  const content=extractContentSegment(original);
  if(content){literalSegments.push(content);protectedSpans.push({kind:"content",start:content.start,end:content.end});}
  return{literalSegments:dedupeSegments(literalSegments),protectedSpans:mergeSpans(protectedSpans),explicitPaths:[...new Set(explicitPaths)]};
}
function extractContentSegment(original:string):NormalizedIntentLiteralSegment|undefined{
  const creation=original.match(/\b(?:com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo|e\s+escreva)\s*:?\s*([\s\S]+)$/iu);
  if(creation)return segmentFromMatch(creation);
  if(!EDIT_VERB.test(original))return undefined;
  const edit=original.match(/\b(?:e\s+coloque|por|para(?:\s+conter)?)\s+([\s\S]+)$/iu);
  return edit?segmentFromMatch(edit):undefined;
}
function segmentFromMatch(match:RegExpMatchArray):NormalizedIntentLiteralSegment|undefined{
  const value=match[1]??"";if(!value)return undefined;
  const base=match.index??0,start=base+match[0].lastIndexOf(value);
  return{type:"content",value,start,end:start+value.length};
}
function addProtected(text:string,regex:RegExp,kind:ProtectedSpan["kind"],out:ProtectedSpan[]){
  for(const match of text.matchAll(regex)){const value=match[0];const start=match.index??0;out.push({kind,start,end:start+value.length});}
}
function mergeSpans(spans:ProtectedSpan[]){
  return spans.sort((a,b)=>a.start-b.start||b.end-a.end).filter((span,index,all)=>!all.slice(0,index).some(previous=>previous.start<=span.start&&previous.end>=span.end));
}
function dedupeSegments(segments:NormalizedIntentLiteralSegment[]){
  const seen=new Set<string>();return segments.filter(segment=>{const key=`${segment.type}:${segment.start}:${segment.end}`;if(seen.has(key))return false;seen.add(key);return true;});
}
