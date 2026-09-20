import type {LLMProvider} from "../../llm/provider.js";
import type {LocalMetricsService} from "../../observability/metrics.js";
import {stripCodeFence} from "../../security/prompt.js";
import {deterministicDomainCandidates} from "./deterministic.js";
import {DOMAIN_RESOLVER_PROMPT} from "./prompt.js";
import {domainResolutionJsonSchema,parseDomainCandidate} from "./schema.js";
import type {DomainResolution} from "./types.js";
export class DomainResolver{
  constructor(private readonly llm?:LLMProvider,private readonly metrics?:LocalMetricsService){}
  async resolve(text:string,signal?:AbortSignal):Promise<DomainResolution>{
    const candidates=deterministicDomainCandidates(text);
    if(candidates[0]?.confidence>=.97&&(!candidates[1]||candidates[0].confidence-candidates[1].confidence>=.01)){
      this.metrics?.record("intent.domain.deterministic",1,{domain:candidates[0].domain});return{status:"resolved",candidate:candidates[0]};
    }
    if(!this.llm){this.metrics?.record("intent.domain.unknown",1);return{status:"unknown",candidates,reason:"NO_CLASSIFIER"};}
    try{
      const candidate=this.llm.planStructured
        ? await this.llm.planStructured({messages:[{role:"system",content:DOMAIN_RESOLVER_PROMPT},{role:"user",content:text}],schema:domainResolutionJsonSchema,schemaName:"NexoDomainV1",parse:parseDomainCandidate},signal)
        : parseDomainCandidate(JSON.parse(stripCodeFence(await this.llm.plan([{role:"system",content:DOMAIN_RESOLVER_PROMPT},{role:"user",content:text}],signal))));
      if(candidate.domain==="unknown"||candidate.confidence<.65)return{status:"unknown",candidates:[...candidates,candidate],reason:"LOW_CONFIDENCE"};
      this.metrics?.record("intent.domain.llm",1,{domain:candidate.domain});return{status:"resolved",candidate};
    }catch(error){this.metrics?.record("intent.domain.unknown",1,{reason:"classifier_error"});return{status:"unknown",candidates,reason:error instanceof Error?error.name:"CLASSIFIER_ERROR"};}
  }
}
