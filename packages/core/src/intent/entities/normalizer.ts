export function normalizeEntityValue(key:string,value:unknown):unknown{
  if(typeof value!=="string")return value;
  const trimmed=value.trim();
  if(key==="domain")return trimmed.replace(/^https?:\/\//i,"").replace(/^www\./i,"").replace(/\/$/,"").toLowerCase();
  if(key==="url"){try{return new URL(trimmed).toString();}catch{return trimmed;}}
  if(key==="to"||key==="recipient")return trimmed.toLowerCase();
  return trimmed;
}
export function literalEntities(text:string){
  const entities:Record<string,unknown>={};
  const url=text.match(/https?:\/\/[^\s<>"']+/i)?.[0];if(url)entities.url=url;
  const email=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];if(email)entities.to=email;
  const physical=text.match(/\b[A-Za-z]:[\\/][^\n\r"']+/)?.[0];if(physical)entities.path=physical.trim();
  const folder=text.match(/\b(?:em|no|na)\s+(Downloads|Documents|Documentos|Desktop|Área de Trabalho)\b/i)?.[1];if(folder)entities.folder=folder;
  return entities;
}
