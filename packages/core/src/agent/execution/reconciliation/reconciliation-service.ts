import type {ExecutionRecordRepository} from "../execution-record-repository.js";
import type {ReconcilerRegistry} from "./reconciler-registry.js";
export class ReconciliationService{
  constructor(private readonly records:ExecutionRecordRepository,private readonly registry:ReconcilerRegistry){}
  async reconcile(executionId:string,signal?:AbortSignal){const record=this.records.getRequired(executionId);if(!["DISPATCHING","RESULT_UNKNOWN","RECONCILING","UNRESOLVED"].includes(record.status))return record;this.records.markReconciling(executionId);const result=await this.registry.reconcile(record,signal);if(result.status==="confirmed_success")this.records.reconcile(executionId,"RECONCILED_SUCCESS",result);else if(result.status==="confirmed_failure")this.records.reconcile(executionId,"RECONCILED_FAILURE",result);else this.records.reconcile(executionId,"UNRESOLVED",result);return this.records.getRequired(executionId);}
  async recover(signal?:AbortSignal){const recovered=[];for(const record of this.records.pendingReconciliation()){if(signal?.aborted)break;recovered.push(await this.reconcile(record.executionId,signal));}return recovered;}
}
