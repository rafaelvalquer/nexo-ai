export class IntentMemorySanitizer{
 sanitize(utterance:string){
  return utterance
   .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"<EMAIL>")
   .replace(/https?:\/\/[^\s<>"']+/gi,"<URL>")
   .replace(/\b[A-Za-z]:[\\/][^\s"']+/g,"<PATH>")
   .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g,"<SECRET>")
   .replace(/(["“]).{40,}?\1/g,"<CONTENT>")
   .replace(/\s+/g," ").trim().slice(0,2000);
 }
 entitiesSignature(entities:Record<string,unknown>){return Object.keys(entities).sort().join(",");}
}
