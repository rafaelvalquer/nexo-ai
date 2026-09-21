import type {ActionContextFile} from "./conversation-action-context.js";

export const FILE_CONTEXT_TOOLS=new Set(["find_file","search_files","list_files","largest_files"]);

export function extractFilesFromToolResult(toolName:string,data:unknown):ActionContextFile[]{
  if(!FILE_CONTEXT_TOOLS.has(toolName))return[];
  const rows=rowsFor(toolName,data);
  return rows
    .filter(item=>item&&typeof item==="object"&&typeof (item as any).path==="string")
    .slice(0,100)
    .map(item=>{
      const row=item as any,path=String(row.path);
      return{
        name:typeof row.name==="string"&&row.name.trim()?row.name:path.replace(/^.*[\\/]/,""),
        path,
        ...(typeof row.root==="string"?{root:row.root}:{}),
        ...(typeof row.size==="number"?{size:row.size}:{}),
        ...(typeof row.modifiedAt==="string"?{modifiedAt:row.modifiedAt}:{})
      };
    });
}
function rowsFor(toolName:string,data:unknown):unknown[]{
  if(toolName==="find_file"||toolName==="search_files")return Array.isArray((data as any)?.matches)?(data as any).matches:[];
  if(toolName==="largest_files")return Array.isArray((data as any)?.files)?(data as any).files:[];
  if(toolName==="list_files")return Array.isArray(data)?data:[];
  return[];
}
