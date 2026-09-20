import type { CanonicalIntent } from "./types.js";

export const intentOperationRequirements = {
  create_folder: {required:["name","folder"],optional:[]},
  create_text_file: {required:["name","folder"],optional:["content"]},
  write_text_file: {required:["file","content"],optional:["folder","path"]},
  find_file: {required:["name"],optional:["folder"]},
  list_files: {required:["folder"],optional:[]},
  search_files: {required:["query"],optional:["folder"]},
  read_file: {required:["path"],optional:[]},
  copy_file: {required:["source","destination"],optional:[]},
  move_file: {required:["source","destination"],optional:[]},
  rename_file: {required:["path","newName"],optional:[]},
  trash_file: {required:["path"],optional:[]},
  file_info: {required:["path"],optional:[]}
} as const;

export function hasIntentEntity(intent:CanonicalIntent,key:string){
  const value=intent.entities[key]?.value;
  if(typeof value==="string")return Boolean(value.trim());
  if(Array.isArray(value))return value.length>0;
  return value!==undefined;
}

export function deriveMissingFields(operation:string,entities:CanonicalIntent["entities"]){
  const requirements=intentOperationRequirements[operation as keyof typeof intentOperationRequirements];
  if(!requirements)return [];
  const intent={entities} as CanonicalIntent;
  return requirements.required.filter(key=>!hasIntentEntity(intent,key));
}

export function sanitizeDeclaredMissing(operation:string,missing:string[]){
  const requirements=intentOperationRequirements[operation as keyof typeof intentOperationRequirements];
  if(!requirements)return [];
  const allowed=new Set<string>(requirements.required);
  return missing.filter(key=>allowed.has(key));
}
