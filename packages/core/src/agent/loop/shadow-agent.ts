import type {LLMProvider} from "../../llm/provider.js";
import type {CapabilityAwareToolCatalog} from "../orchestrator/tool-catalog.js";
import {createAgentToolSchemas} from "../../llm/agent/tool-schema-factory.js";
import {AgentContextManager} from "../context/agent-context-manager.js";
import {validateAgentTurn} from "./agent-protocol.js";
import type {AgentModelMessage} from "./types.js";
export type ShadowDecision={kind:"final";toolSequence:[];intendedOutcome:"final"}|{kind:"tool";toolName:string;toolSequence:string[];mutatesState:boolean;intendedOutcome:"tool"}|{kind:"invalid";toolSequence:[];intendedOutcome:"invalid"};
/** Decision-only shadow runner. It has no executor dependency and therefore cannot run any tool. */
export class ShadowAgent{
  constructor(private readonly llm:LLMProvider,private readonly catalog:CapabilityAwareToolCatalog,private readonly context=new AgentContextManager()){}
  async decide(request:string,conversation:AgentModelMessage[]=[],signal?:AbortSignal):Promise<ShadowDecision>{if(!this.llm.agentTurn)return{kind:"invalid",toolSequence:[],intendedOutcome:"invalid"};const catalog=this.catalog.list(),schemas=createAgentToolSchemas(catalog),decision=validateAgentTurn(await this.llm.agentTurn({messages:this.context.build(request,conversation),tools:schemas},signal));if(decision.kind==="final")return{kind:"final",toolSequence:[],intendedOutcome:"final"};if(decision.kind==="repair")return{kind:"invalid",toolSequence:[],intendedOutcome:"invalid"};const descriptor=catalog.find(tool=>tool.name===decision.call.name);return{kind:"tool",toolName:decision.call.name,toolSequence:[decision.call.name],mutatesState:descriptor?.mutatesState??true,intendedOutcome:"tool"};}
}
