import type {ToolRegistry} from "../../tools/registry.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import {FilesystemActionPlanner} from "./filesystem-action-planner.js";

export type CanonicalActionRequest={
  domain:string;
  operation:string;
  entities:Record<string,unknown>;
  candidateId?:string;
  decisionSource:CanonicalActionPlan["source"]["decisionSource"];
};

export class CanonicalActionPlanner{
  private readonly filesystem:FilesystemActionPlanner;
  constructor(private readonly registry:ToolRegistry){this.filesystem=new FilesystemActionPlanner(registry);}
  plan(request:CanonicalActionRequest):CanonicalActionPlan|undefined{
    if(request.domain==="filesystem")return this.filesystem.plan(request);
    const tool=request.operation;
    const definition=this.registry.get(tool);
    if(!definition)return undefined;
    return{
      id:request.candidateId??`canonical:${request.domain}:${request.operation}`,
      domain:canonicalDomain(request.domain),
      operation:request.operation,
      entities:{...request.entities},
      steps:[{tool,input:{...request.entities}}],
      requiresApproval:Boolean(definition.mutatesState),
      expectedEffect:tool,
      source:{candidateId:request.candidateId??tool,decisionSource:request.decisionSource}
    };
  }
}
function canonicalDomain(value:string):CanonicalActionPlan["domain"]{
  if(value==="document"||value==="documents")return"documents";
  if(value==="filesystem"||value==="web"||value==="browser"||value==="email"||value==="calendar"||value==="system")return value;
  return"system";
}
