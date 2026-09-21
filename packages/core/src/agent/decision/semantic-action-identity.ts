import {createHash} from "node:crypto";
import type {DecisionCandidate} from "./types.js";

export function semanticActionIdentity(candidate:DecisionCandidate):string{
  const operation=canonicalOperation(candidate.operation,candidate.proposedTool);
  const entities=candidate.entities??{};
  const effect=mutationEffect(operation,entities)??readEffect(operation,entities);
  return stableStringify({domain:canonicalDomain(candidate.domain),operation,effect});
}

export function stableCandidateId(candidate:Omit<DecisionCandidate,"candidateId">|DecisionCandidate):string{
  return "candidate:"+sha256(stableStringify({source:candidate.source,identity:semanticActionIdentity(candidate as DecisionCandidate)})).slice(0,24);
}

export function semanticGroupId(candidate:DecisionCandidate):string{
  return "group:"+sha256(semanticActionIdentity(candidate)).slice(0,24);
}

export function sha256(value:string):string{return createHash("sha256").update(value,"utf8").digest("hex");}

function mutationEffect(operation:string,entities:Record<string,unknown>){
  switch(operation){
    case"write_text_file":return{target:target(entities),contentHash:sha256(text(entities.content))};
    case"create_text_file":return{target:createTarget(entities),contentHash:sha256(text(entities.content))};
    case"rename_file":return{path:norm(entities.path),newName:norm(entities.newName??entities.newPath)};
    case"move_file":
    case"copy_file":return{source:norm(entities.source),destination:norm(entities.destination)};
    case"email_send":
    case"email_send_composed":return{recipients:canonicalArray(entities.to??entities.recipients),subject:norm(entities.subject),bodyHash:sha256(text(entities.body??entities.bodyText))};
    case"calendar_update":return{eventId:norm(entities.eventId),patch:canonicalObject(omit(entities,["eventId","connectionId"]))};
    case"calendar_create":return canonicalObject(omit(entities,["connectionId"]));
    case"calendar_delete":return{eventId:norm(entities.eventId)};
    case"trash_file":return{path:norm(entities.path)};
    default:return undefined;
  }
}

function readEffect(operation:string,entities:Record<string,unknown>){
  const keys=operation==="find_file"||operation==="search_files"
    ?["path","root","folder","name","file","query"]
    :operation==="list_files"||operation==="largest_files"
      ?["path","root","folder","kind","sortBy","sortDirection","limit"]
      :["path","url","domain","sourceName","query","messageId","eventId","requestedAction"];
  return canonicalObject(Object.fromEntries(keys.filter(key=>entities[key]!==undefined).map(key=>[key,entities[key]])));
}
function canonicalOperation(operation:string,tool?:string){
  const value=tool??operation;
  if(value==="open_path")return"open_file";
  if(value==="browser_agent_run")return"browser_agent_run";
  return operation||value;
}
function canonicalDomain(domain:string){return domain==="document"?"documents":domain;}
function target(entities:Record<string,unknown>){return norm(entities.path??entities.file??entities.name);}
function createTarget(entities:Record<string,unknown>){return norm(entities.path??[entities.folder,entities.name].filter(Boolean).join("/"));}
function text(value:unknown){return typeof value==="string"?value:stableStringify(value??"");}
function norm(value:unknown):unknown{
  if(typeof value==="string")return value.trim().replace(/\\/g,"/").toLowerCase();
  if(Array.isArray(value))return canonicalArray(value);
  if(value&&typeof value==="object")return canonicalObject(value as Record<string,unknown>);
  return value??null;
}
function canonicalArray(value:unknown){const rows=Array.isArray(value)?value:[value];return rows.filter(item=>item!==undefined&&item!==null).map(norm).sort((a,b)=>stableStringify(a).localeCompare(stableStringify(b)));}
function canonicalObject(value:Record<string,unknown>){return Object.fromEntries(Object.keys(value).sort().map(key=>[key,norm(value[key])]));}
function omit(value:Record<string,unknown>,keys:string[]){const blocked=new Set(keys);return Object.fromEntries(Object.entries(value).filter(([key])=>!blocked.has(key)));}
function stableStringify(value:unknown):string{
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
  const record=value as Record<string,unknown>;
  return "{"+Object.keys(record).sort().map(key=>JSON.stringify(key)+":"+stableStringify(record[key])).join(",")+"}";
}
