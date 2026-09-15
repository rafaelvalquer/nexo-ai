import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import type {ExecutionRecord} from "../execution-record-repository.js";
import type {MutationReconciler,ReconciliationResult} from "./reconciler.js";

export class FilesystemReconciler implements MutationReconciler{
  supports(record:ExecutionRecord){return["create_folder","copy_file","move_file","rename_file","compress_files","extract_archive"].includes(record.toolName);}
  async reconcile(record:ExecutionRecord,signal?:AbortSignal):Promise<ReconciliationResult>{if(signal?.aborted)throw signal.reason;const input=record.input;switch(record.toolName){case"create_folder":return await isDirectory(input.path)?success("Diretório existe."):failure();case"copy_file":return await copied(input.source,input.destination,input.__nexoSourceHash);case"compress_files":return await exists(input.destination)?success("Destino existe."):failure();case"move_file":return await moved(input.source,input.destination,input.__nexoSourceHash);case"rename_file":return await moved(input.path,input.newPath,input.__nexoSourceHash);case"extract_archive":return await isDirectory(input.destination)?success("Diretório extraído existe."):{status:"still_unknown",reason:"O diretório de destino não comprova extração completa."};default:return{status:"still_unknown"};}}
}
async function exists(value:unknown){if(typeof value!=="string")return false;try{await fs.access(value);return true;}catch{return false;}}
async function isDirectory(value:unknown){if(typeof value!=="string")return false;try{return(await fs.stat(value)).isDirectory();}catch{return false;}}
async function copied(source:unknown,destination:unknown,expected:unknown):Promise<ReconciliationResult>{if(typeof source!=="string"||typeof destination!=="string")return{status:"still_unknown"};const[a,b]=await Promise.all([hash(source),hash(destination)]);if(!b)return failure();if(a&&a===b&&(!expected||expected===b))return success("Origem e destino possuem o mesmo SHA-256.");return a?failure():{status:"still_unknown",reason:"Não foi possível comparar o conteúdo da origem."};}
async function moved(source:unknown,destination:unknown,expected?:unknown):Promise<ReconciliationResult>{const[from,to,destinationHash]=await Promise.all([exists(source),exists(destination),hash(destination)]);if(!from&&to&&(!expected||expected===destinationHash))return success("Origem ausente, destino presente e hash preservado.");if(from&&!to)return failure();return{status:"still_unknown",reason:"Estado de origem/destino não permite conclusão segura."};}
function success(summary:string):ReconciliationResult{return{status:"confirmed_success",result:{ok:true,summary}};}function failure():ReconciliationResult{return{status:"confirmed_failure"};}
async function hash(value:unknown){if(typeof value!=="string")return undefined;try{return createHash("sha256").update(await fs.readFile(value)).digest("hex");}catch{return undefined;}}
