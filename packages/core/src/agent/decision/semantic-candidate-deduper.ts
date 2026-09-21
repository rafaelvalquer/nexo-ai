import type {DecisionCandidate,DecisionCandidateSource} from "./types.js";
import {semanticActionIdentity,semanticGroupId} from "./semantic-action-identity.js";

export type SemanticCandidateGroup={
  groupId:string;
  candidate:DecisionCandidate;
  memberCandidateIds:string[];
  mergedSources:DecisionCandidateSource[];
  duplicateCount:number;
};

export class SemanticCandidateDeduper{
  dedupe(candidates:DecisionCandidate[]):DecisionCandidate[]{
    return this.group(candidates).map(item=>item.candidate);
  }

  group(candidates:DecisionCandidate[]):SemanticCandidateGroup[]{
    const groups=new Map<string,SemanticCandidateGroup>();
    for(const candidate of candidates){
      const identity=semanticActionIdentity(candidate);
      const current=groups.get(identity);
      if(!current){
        groups.set(identity,{
          groupId:semanticGroupId(candidate),
          candidate:{...candidate,entities:{...candidate.entities},evidence:[...candidate.evidence],provenance:[...(candidate.provenance??[]),candidate.source]},
          memberCandidateIds:[candidate.candidateId],
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
      current.memberCandidateIds=[...new Set([...current.memberCandidateIds,candidate.candidateId])];
      current.mergedSources=[...new Set([...current.mergedSources,candidate.source])];
      current.duplicateCount++;
    }
    return [...groups.values()];
  }

  merge(candidates:DecisionCandidate[]){return this.group(candidates);}
}

export function semanticActionKey(candidate:DecisionCandidate){return semanticActionIdentity(candidate);}

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
