import type { LocalMetricsService } from "../observability/metrics.js";

type Waiter={resolve:()=>void;reject:(error:unknown)=>void;signal?:AbortSignal;onAbort?:()=>void};
class Semaphore{
  private active=0;private queue:Waiter[]=[];
  constructor(private limit:number){}
  setLimit(value:number){this.limit=Math.max(1,value);this.drain();}
  get count(){return this.active;} get queued(){return this.queue.length;}
  async acquire(signal?:AbortSignal){if(signal?.aborted)throw signal.reason??new DOMException("Cancelado","AbortError");if(this.active<this.limit){this.active++;return()=>this.release();}await new Promise<void>((resolve,reject)=>{const waiter:Waiter={resolve,reject,signal};if(signal){waiter.onAbort=()=>{this.queue=this.queue.filter(item=>item!==waiter);reject(signal.reason??new DOMException("Cancelado","AbortError"));};signal.addEventListener("abort",waiter.onAbort,{once:true});}this.queue.push(waiter);});this.active++;return()=>this.release();}
  private release(){this.active=Math.max(0,this.active-1);this.drain();}
  private drain(){while(this.active<this.limit&&this.queue.length){const waiter=this.queue.shift()!;if(waiter.signal?.aborted)continue;if(waiter.onAbort)waiter.signal?.removeEventListener("abort",waiter.onAbort);waiter.resolve();break;}}
}

class Mutex{
  private tail=Promise.resolve();
  async run<T>(work:()=>Promise<T>):Promise<T>{const previous=this.tail;let release!:()=>void;this.tail=new Promise<void>(resolve=>{release=resolve;});await previous;try{return await work();}finally{release();}}
}

export class ResourceManager{
  private llm:Semaphore;private locks=new Map<string,Mutex>();
  constructor(maxConcurrentLlm=2,private metrics?:LocalMetricsService){this.llm=new Semaphore(Math.max(1,Math.min(4,maxConcurrentLlm)));}
  setLlmLimit(value:number){this.llm.setLimit(Math.max(1,Math.min(4,value)));}
  async withLlm<T>(work:()=>Promise<T>,signal?:AbortSignal){const started=Date.now();const release=await this.llm.acquire(signal);this.metrics?.record("llm.queue_wait_ms",Date.now()-started);this.metrics?.record("llm.concurrent_requests",this.llm.count);try{return await work();}finally{release();}}
  async withResources<T>(keys:string[],work:()=>Promise<T>):Promise<T>{const unique=[...new Set(keys.filter(Boolean))].sort();const run=(index:number):Promise<T>=>index>=unique.length?work():this.mutex(unique[index]).run(()=>run(index+1));return run(0);}
  snapshot(){return{llmActive:this.llm.count,llmQueued:this.llm.queued,locks:this.locks.size};}
  private mutex(key:string){let value=this.locks.get(key);if(!value){value=new Mutex();this.locks.set(key,value);}return value;}
}
