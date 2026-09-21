import type {DomainActionPlanner,CanonicalPlanningContext,ToolAvailability} from "./planning-types.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {planBase,readStep,stringValue,numberValue,unavailable} from "./planning-utils.js";

export class WebActionPlanner implements DomainActionPlanner{
  constructor(private readonly tools:ToolAvailability){}
  plan(decision:CanonicalIntentDecision,context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
    const e=decision.entities,operation=decision.operation;
    if(operation==="research"||operation==="web_research"){
      const query=stringValue(e.query??e.topic)??context.originalText;if(!query)return planBase(decision,[],{direct:"O que você quer pesquisar?"});
      const step=readStep(this.tools,"web_research",{query,...(stringValue(e.sourceName)?{sourceName:stringValue(e.sourceName)}:{}),...(stringValue(e.domain)?{domain:stringValue(e.domain)}:{}),...(stringValue(e.url)?{url:stringValue(e.url)}:{}),maxSources:numberValue(e.maxSources,5,1,5)},stringValue(e.sourceName)?`Pesquisando no ${stringValue(e.sourceName)} e lendo as principais fontes…`:"Pesquisando na web e lendo as principais fontes…");
      return step?planBase(decision,[step],{responseMode:"synthesize",expectedEffect:"web_research"}):unavailable(decision,"web_research");
    }
    if(operation==="search"||operation==="web_search"){
      const query=stringValue(e.query)??context.originalText;if(!query)return planBase(decision,[],{direct:"O que você quer pesquisar?"});
      const step=readStep(this.tools,"web_search",{query,maxResults:numberValue(e.maxResults,6,1,10)},"Pesquisando na web…");
      return step?planBase(decision,[step],{responseMode:"presentation",expectedEffect:"web_search"}):unavailable(decision,"web_search");
    }
    if(operation==="fetch"||operation==="web_fetch"){
      const url=stringValue(e.url);if(!url)return planBase(decision,[],{direct:"Qual página você quer abrir?"});
      const step=readStep(this.tools,"web_fetch",{url,maxChars:numberValue(e.maxChars,16000,500,30000)},"Lendo a página sem abrir navegador…");
      return step?planBase(decision,[step],{responseMode:"synthesize",expectedEffect:"web_fetch"}):unavailable(decision,"web_fetch");
    }
    if(operation==="web_extract"){
      const url=stringValue(e.url);if(!url)return planBase(decision,[],{direct:"Qual página você quer extrair?"});
      const step=readStep(this.tools,"web_extract",{url,...(e.instruction!==undefined?{instruction:e.instruction}:{})},"Extraindo o conteúdo da página…");
      return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,"web_extract");
    }
    return undefined;
  }
}
