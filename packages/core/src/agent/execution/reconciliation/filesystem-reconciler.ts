import fs from "node:fs/promises";
import type {ExecutionRecord} from "../execution-record-repository.js";
import type {MutationReconciler,ReconciliationResult} from "./reconciler.js";

export class FilesystemReconciler implements MutationReconciler{
  supports(record:ExecutionRecord){return["create_folder","copy_file","move_file","rename_file","compress_files","extract_archive"].includes(record.toolName);}
  async reconcile(record:ExecutionRecord,signal?:AbortSignal):Promise<ReconciliationResult>{if(signal?.aborted)throw signal.reason;const input=record.input;switch(record.toolName){case"create_folder":return await isDirectory(input.path)?success("Diretório existe."):failure();case"copy_file":case"compress_files":return await exists(input.destination)?success("Destino existe."):failure();case"move_file":return await moved(input.source,input.destination);case"rename_file":return await moved(input.path,input.newPath);case"extract_archive":return await isDirectory(input.destination)?success("Diretório extraído existe."):{status:"still_unknown",reason:"O diretório de destino não comprova extração completa."};default:return{status:"still_unknown"};}}
}
async function exists(value:unknown){if(typeof value!=="string")return false;try{await fs.access(value);return true;}catch{return false;}}
async function isDirectory(value:unknown){if(typeof value!=="string")return false;try{return(await fs.stat(value)).isDirectory();}catch{return false;}}
async function moved(source:unknown,destination:unknown):Promise<ReconciliationResult>{const [from,to]=await Promise.all([exists(source),exists(destination)]);if(!from&&to)return success("Origem ausente e destino presente.");if(from&&!to)return failure();return{status:"still_unknown",reason:"Estado de origem/destino não permite conclusão segura."};}
function success(summary:string):ReconciliationResult{return{status:"confirmed_success",result:{ok:true,summary}};}function failure():ReconciliationResult{return{status:"confirmed_failure"};}
