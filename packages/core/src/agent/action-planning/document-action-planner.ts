import type {DomainActionPlanner,CanonicalPlanningContext,ToolAvailability} from "./planning-types.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {planBase,readStep,writeStep,stringValue,stringRaw,unavailable} from "./planning-utils.js";

export class DocumentActionPlanner implements DomainActionPlanner{
 constructor(private readonly tools:ToolAvailability){}
 plan(decision:CanonicalIntentDecision,_context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
  const e=decision.entities,op=decision.operation;
  if(["document_get","document_read","document_summarize","document_extract","document_compare"].includes(op)){
    const input={...e};const step=readStep(this.tools,op,input,`Executando ${op.replace(/_/g," ")}…`);
    return step?planBase(decision,[step],{responseMode:"synthesize"}):unavailable(decision,op);
  }
  if(op==="document_create"){
    const name=stringValue(e.name),content=stringRaw(e.content);if(!name||content===undefined)return planBase(decision,[],{direct:"Informe o nome e o conteúdo do documento."});
    const step=writeStep(this.tools,op,{...e,name,content},"Preparando a criação do documento…",{domain:"documents",actionType:"create",affectedCount:1,preview:name,consequence:"Um novo documento será criado.",expiresInMs:10*60_000});
    return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,op);
  }
  return undefined;
 }
}
