import type { NormalizedIntentInput,NormalizedIntentLiteralSegment } from "./types.js";

const QUOTED=/["“”']([^"“”']+)["“”']/gu;
const WINDOWS_PATH=/\b[A-Za-z]:[\\/][^\n,;]+/gu;
const UNC_PATH=/\\\\[^\s]+(?:\\[^\s]+)*/gu;
const POSIX_PATH=/(?:^|\s)(\/[^\s,;]+)/gu;
const EXTENSION=/\.([A-Za-z0-9]{1,12})\b/gu;
const EDIT_VERB=/\b(?:edite|editar|altere|alterar|troque|mude|mudar|modifique|modificar|substitua|escreva|escrever)\b/iu;

export function normalizeIntentInput(text:string):NormalizedIntentInput{
  const original=text;
  const normalizedLineEndings=text.normalize("NFKC").replace(/\r\n?/g,"\n");
  const routingText=normalizedLineEndings.replace(/[\t\n ]+/g," ").trim();
  const literalSegments:NormalizedIntentLiteralSegment[]=[];

  for(const match of original.matchAll(QUOTED)){
    const value=match[1]??"";
    const offset=(match.index??0)+match[0].indexOf(value);
    literalSegments.push({type:"quoted",value,start:offset,end:offset+value.length});
  }

  const explicitPaths:string[]=[];
  for(const regex of [WINDOWS_PATH,UNC_PATH]){
    for(const match of original.matchAll(regex)){
      const value=match[0].trim();
      const start=(match.index??0)+match[0].indexOf(value);
      explicitPaths.push(value);
      literalSegments.push({type:"path",value,start,end:start+value.length});
    }
  }
  for(const match of original.matchAll(POSIX_PATH)){
    const value=(match[1]??"").trim();if(!value)continue;
    const start=(match.index??0)+match[0].lastIndexOf(value);
    explicitPaths.push(value);
    literalSegments.push({type:"path",value,start,end:start+value.length});
  }

  const content=extractContentSegment(original);
  if(content)literalSegments.push(content);

  const quoted=literalSegments.filter(segment=>segment.type==="quoted").map(segment=>segment.value);
  const extensions=[...new Set([...normalizedLineEndings.matchAll(EXTENSION)].map(match=>match[1].toLowerCase()))];
  return{original,routingText,normalized:normalizedLineEndings.trim(),literalSegments:dedupeSegments(literalSegments),quoted,explicitPaths:[...new Set(explicitPaths)],extensions};
}

function extractContentSegment(original:string):NormalizedIntentLiteralSegment|undefined{
  const creation=original.match(/\b(?:com\s+(?:o\s+)?(?:conte[uú]do|texto)|contendo|e\s+escreva)\s*:?\s*([\s\S]+)$/iu);
  if(creation)return segmentFromMatch(original,creation);
  if(!EDIT_VERB.test(original))return undefined;
  const edit=original.match(/\b(?:e\s+coloque|por|para(?:\s+conter)?)\s+([\s\S]+)$/iu);
  return edit?segmentFromMatch(original,edit):undefined;
}

function segmentFromMatch(original:string,match:RegExpMatchArray):NormalizedIntentLiteralSegment|undefined{
  const value=match[1]??"";if(!value)return undefined;
  const base=match.index??0,start=base+match[0].lastIndexOf(value);
  return{type:"content",value,start,end:start+value.length};
}

function dedupeSegments(segments:NormalizedIntentLiteralSegment[]){
  const seen=new Set<string>();
  return segments.filter(segment=>{const key=`${segment.type}:${segment.start}:${segment.end}`;if(seen.has(key))return false;seen.add(key);return true;});
}
