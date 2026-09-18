import type { CanonicalIntent, IntentAction } from "./types.js";

const OPERATION_TO_ACTION:Record<string,IntentAction>={
  create_folder:"create",create_text_file:"create",write_text_file:"update",
  find_file:"find",search_files:"find",list_files:"list",read_file:"read",file_info:"read",
  copy_file:"create",move_file:"update",rename_file:"update",trash_file:"delete"
};

export function adaptDeterministicTool(tool:string,input:Record<string,unknown>):CanonicalIntent|undefined{
  const action=OPERATION_TO_ACTION[tool];
  if(!action)return undefined;
  const entities=Object.fromEntries(Object.entries(input).filter(([,value])=>["string","number","boolean"].includes(typeof value)).map(([key,value])=>[key,{value:value as string|number|boolean,source:"inferred" as const,confidence:1}]));
  return{schemaVersion:1,domain:"filesystem",intent:action,operation:tool,entities,referencesPreviousResult:false,ambiguities:[],missing:[],source:"deterministic",diagnostics:{rawModelConfidence:1,resolverVersion:"deterministic-adapter-v1"}};
}
