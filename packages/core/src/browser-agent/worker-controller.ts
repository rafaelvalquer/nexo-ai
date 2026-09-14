import type { BrowserWorkerCommand, BrowserWorkerMessage } from "@nexo/browser-agent";

export type BrowserWorkerHandle = {
  postMessage:(message:BrowserWorkerCommand)=>void;
  kill:()=>boolean;
  onMessage:(listener:(message:BrowserWorkerMessage)=>void)=>()=>void;
  onExit:(listener:(code:number)=>void)=>()=>void;
};
export type BrowserWorkerFactory=()=>BrowserWorkerHandle;

export class BrowserAgentWorkerController {
  private worker?:BrowserWorkerHandle;
  private ready=false;
  constructor(private readonly factory:BrowserWorkerFactory){}

  async start(onMessage:(message:BrowserWorkerMessage)=>void,onExit:(code:number)=>void) {
    if (this.worker) throw new Error("Browser Agent worker já está ativo.");
    const worker=this.factory();
    this.worker=worker;
    this.ready=false;
    await new Promise<void>((resolve,reject)=>{
      let settled=false;
      let offMessage=()=>{};
      let offExit=()=>{};
      const cleanupReady=()=>{clearTimeout(timer);};
      const timer=setTimeout(()=>{
        if(settled)return;
        settled=true;
        cleanupReady();
        offMessage();offExit();
        this.worker=undefined;
        worker.kill();
        reject(new Error("Browser Agent worker não ficou pronto dentro do tempo limite."));
      },10_000);
      timer.unref?.();
      offMessage=worker.onMessage(message=>{
        onMessage(message);
        if(message.type!=="ready"||settled)return;
        settled=true;this.ready=true;cleanupReady();resolve();
      });
      offExit=worker.onExit(code=>{
        cleanupReady();offMessage();offExit();
        const wasReady=this.ready;
        this.ready=false;this.worker=undefined;
        if(!settled){settled=true;reject(new Error(`Browser Agent worker encerrou antes de ficar pronto (código ${code}).`));}
        if(wasReady)onExit(code);
      });
    });
  }

  send(command:BrowserWorkerCommand){if(!this.worker||!this.ready)throw new Error("Browser Agent worker indisponível.");this.worker.postMessage(command);}
  stop(){const worker=this.worker;this.worker=undefined;this.ready=false;return worker?.kill()??false;}
  get active(){return Boolean(this.worker&&this.ready);}
}
