import type {AgentLoopState,AgentObservation} from "../../loop/types.js";
import {observationFingerprint} from "../../loop/loop-guard.js";
import type {ExecutionRecord,ExecutionRecordRepository} from "../execution-record-repository.js";
import type {ReconciliationService} from "./reconciliation-service.js";
export interface AgentReconciliationCoordinator {reconcileRun(state:AgentLoopState,executionId:string,signal?:AbortSignal):Promise<AgentLoopState>;}
export class DefaultAgentReconciliationCoordinator implements AgentReconciliationCoordinator{
  constructor(private readonly service:ReconciliationService,private readonly records:ExecutionRecordRepository,private readonly observe:(state:AgentLoopState,record:ExecutionRecord)=>AgentObservation){}
  async reconcileRun(state:AgentLoopState,executionId:string,signal?:AbortSignal){
    if(!state.pendingAction||state.pendingAction.executionId!==executionId)throw new Error("A execução ambígua não corresponde à ação pendente da run.");
    state.status="RECONCILING";state.updatedAt=new Date().toISOString();const record=await this.service.reconcile(executionId,signal);
    if(record.status==="UNRESOLVED"){state.status="RESULT_UNKNOWN";state.executionSafetyState="RESULT_UNKNOWN";state.finalResponse="O resultado da ação ainda é desconhecido. A run foi bloqueada para impedir repetição automática.";return state;}
    if(record.status!=="RECONCILED_SUCCESS"&&record.status!=="RECONCILED_FAILURE")throw new Error(`Estado de reconciliation inválido: ${record.status}`);
    const observation=this.observe(state,record);state.observations.push(observation);state.observationFingerprints.push(observationFingerprint(observation));state.messages.push({role:"tool",toolCallId:observation.toolCallId,content:JSON.stringify({source:observation.toolName,trust:observation.trust,data:observation.data,references:observation.references,summary:observation.summary}),trust:observation.trust});state.toolCallCount++;state.iteration++;state.pendingAction=undefined;state.consecutiveFailures=record.status==="RECONCILED_SUCCESS"?0:state.consecutiveFailures+1;state.executionSafetyState="MUTATION_COMPLETED";state.finalResponse=undefined;state.status="DECIDING";state.updatedAt=new Date().toISOString();return state;
  }
}
