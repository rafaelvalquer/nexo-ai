import type {ClarificationOption,StructuredClarification} from "./clarification-types.js";

export type StructuredResolution={status:"resolved";option:ClarificationOption}|{status:"expired"|"invalid"|"already_resolved"};

export class ClarificationResolutionService{
  private readonly resolved=new Set<string>();
  resolve(clarification:StructuredClarification,optionId:string):StructuredResolution{
    if(this.resolved.has(clarification.id))return{status:"already_resolved"};
    if(Date.parse(clarification.expiresAt)<=Date.now())return{status:"expired"};
    const option=clarification.options.find(item=>item.id===optionId);
    if(!option)return{status:"invalid"};
    this.resolved.add(clarification.id);
    return{status:"resolved",option};
  }
}
