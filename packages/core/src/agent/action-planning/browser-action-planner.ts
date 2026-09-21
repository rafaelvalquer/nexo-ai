import type {DomainActionPlanner,CanonicalPlanningContext,ToolAvailability} from "./planning-types.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {planBase,readStep,stringValue,unavailable} from "./planning-utils.js";
import {WebDestinationResolver} from "../../web/web-destination-resolver.js";

export class BrowserActionPlanner implements DomainActionPlanner{
  private readonly destinations=new WebDestinationResolver();
  constructor(private readonly tools:ToolAvailability){}
  plan(decision:CanonicalIntentDecision,context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
    const e=decision.entities;
    if(decision.operation==="navigate"||decision.operation==="browser_open"||decision.operation==="browser_navigate"){
      const known=this.destinations.resolveKnown(stringValue(e.sourceName));
      const url=stringValue(e.url)??(stringValue(e.domain)?`https://${stringValue(e.domain)!.replace(/^https?:\/\//,"")}`:known?.url);
      if(!url)return planBase(decision,[],{direct:"Qual site você quer abrir?"});
      const step=readStep(this.tools,"browser_open",{url},`Abrindo ${url}…`);
      return step?planBase(decision,[step],{responseMode:"deterministic",expectedEffect:"browser_open"}):unavailable(decision,"browser_open");
    }
    if(decision.operation==="interact"||decision.operation==="browser_agent_run"){
      const request=stringValue(e.requestedAction??e.request)??context.originalText;if(!request)return planBase(decision,[],{direct:"O que você quer fazer no navegador?"});
      const mode=/\b(minha conta|meu perfil|login|autenticad[oa])\b/i.test(request)?"personal":"research";
      const step=readStep(this.tools,"browser_agent_run",{request,mode},"Executando a interação solicitada no navegador…");
      return step?planBase(decision,[step],{responseMode:"presentation",expectedEffect:"browser_interaction"}):unavailable(decision,"browser_agent_run");
    }
    return undefined;
  }
}
