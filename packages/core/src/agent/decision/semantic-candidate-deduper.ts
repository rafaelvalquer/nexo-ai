import type {DecisionCandidate,DecisionCandidateSource} from "./types.js";

export type SemanticCandidateMerge={
  candidate:DecisionCandidate;
  mergedSources:DecisionCandidateSource[];
  duplicateCount:number;
};

export class SemanticCandidateDeduper{
  dedupe(candidates:DecisionCandidate[]):DecisionCandidate[]{
    return this.merge(candidates).map(item=>item.candidate);
  }

  merge(candidates:DecisionCandidate[]):SemanticCandidateMerge[]{
    const groups=new Map<string,SemanticCandidateMerge>();
    for(const candidate of candidates){
      const actionKey=semanticActionKey(candidate);
      const current=groups.get(actionKey);
      if(!current){
        groups.set(actionKey,{
          candidate:{...candidate,entities:{...candidate.entities},evidence:[...candidate.evidence],provenance:[...(candidate.provenance??[]),candidate.source]},
          mergedSources:[candidate.source],
          duplicateCount:0
        });
        continue;
      }
      const preferred=sourceRank(candidate.source)>sourceRank(current.candidate.source)?candidate:current.candidate;
      const fallback=preferred===candidate?current.candidate:candidate;
      current.candidate={
        ...preferred,
        entities:mergeEntities(preferred.entities,fallback.entities),
        confidence:Math.max(current.candidate.confidence,candidate.confidence),
        missing:[...new Set([...current.candidate.missing,...candidate.missing])],
        ambiguities:[...new Set([...current.candidate.ambiguities,...candidate.ambiguities])],
        evidence:[...new Set([...current.candidate.evidence,...candidate.evidence,`also:${candidate.source}`])],
        provenance:[...new Set([...(current.candidate.provenance??[]),...current.mergedSources,candidate.source])]
      };
      current.mergedSources=[...new Set([...current.mergedSources,candidate.source])];
      current.duplicateCount++;
    }
    return [...groups.values()];
  }
}

export function semanticActionKey(candidate:DecisionCandidate){
  const tool=candidate.proposedTool??candidate.operation;
  const operation=semanticOperation(candidate.operation,tool);
  const effect=effectIdentity(candidate.entities);
  return `${candidate.domain}:${operation}:${tool}:${effect}`;
}

function semanticOperation(operation:string,tool:string){
  if(tool==="browser_agent_run")return"interact";
  if(tool==="web_research")return"research";
  if(tool==="web_search")return"search";
  if(tool==="find_file")return"find";
  if(tool==="write_text_file")return"update";
  return operation;
}
function effectIdentity(entities:Record<string,unknown>){
  const keys=["path","source","destination","file","name","url","messageId","eventId","query"];
  const rows=keys.flatMap(key=>{
    const value=entities[key];
    if(value===undefined||value===null||value==="")return[];
    return [[key,normalizeValue(value)] as const];
  });
  return JSON.stringify(Object.fromEntries(rows));
}
function normalizeValue(value:unknown):unknown{
  if(typeof value==="string")return value.trim().replace(/\\/g,"/").toLowerCase();
  if(Array.isArray(value))return value.map(normalizeValue);
  return value;
}
function mergeEntities(primary:Record<string,unknown>,secondary:Record<string,unknown>){
  const merged={...secondary,...primary};
  for(const [key,value] of Object.entries(secondary)){
    if(merged[key]===undefined||merged[key]===null||merged[key]==="")merged[key]=value;
  }
  return merged;
}
function sourceRank(source:DecisionCandidateSource){
  return source==="exact"?7:source==="filesystem"?6:source==="hybrid"?5:source==="web"?4:source==="planner"?3:source==="intent_memory"?2:1;
}
