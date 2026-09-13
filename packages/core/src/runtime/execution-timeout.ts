export type ExecutionSignal = { signal:AbortSignal; dispose:()=>void; timedOut:()=>boolean };
export function createExecutionSignal(manual:AbortSignal,minutes:number|null):ExecutionSignal{
  if(minutes===null)return{signal:manual,dispose:()=>undefined,timedOut:()=>false};
  const controller=new AbortController();let didTimeout=false;
  const delay=Math.max(1,minutes)*60_000;
  const timer=setTimeout(()=>{didTimeout=true;controller.abort(new DOMException(`A execução excedeu o limite de ${minutes} minuto(s).`,"TimeoutError"));},delay);
  return{signal:AbortSignal.any([manual,controller.signal]),dispose:()=>clearTimeout(timer),timedOut:()=>didTimeout};
}
