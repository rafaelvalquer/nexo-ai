import { FastIntentRouter } from "./fast-intent-router.js";

export type DeterministicRoute =
  | { type:"tool"; tool:string; input:Record<string,unknown>; explanation?:string }
  | { type:"macro"; operation:string; input:Record<string,unknown>; explanation?:string }
  | { type:"chat"; response?:string; stream?:true }
  | { type:"unknown" };

/** Exposes intent routing as command data; it does not hand planner plans to callers. */
export class DeterministicRouter {
  private readonly router=new FastIntentRouter();
  route(text:string,options:{allowedRoots?:string[]}={}):DeterministicRoute {
    const legacy=this.router.route(text,options);
    if(!legacy)return{type:"unknown"};
    const step=legacy.steps?.length===1?legacy.steps[0]:undefined;
    const tool=step?.tool??legacy.tool;
    const input=step?.input??legacy.input??{};
    const explanation=step?.explanation??legacy.explanation;
    if(tool)return tool.startsWith("macro_")
      ?{type:"macro",operation:tool.slice("macro_".length),input,explanation}
      :{type:"tool",tool,input,explanation};
    if(typeof legacy.direct==="string")return{type:"chat",response:legacy.direct};
    if(legacy.directStream)return{type:"chat",stream:true};
    return{type:"unknown"};
  }
}

export { FastIntentRouter } from "./fast-intent-router.js";
