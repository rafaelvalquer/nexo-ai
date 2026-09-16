#!/usr/bin/env node
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {BrowserAgentSessionManager} from "../packages/core/dist/browser-agent/session-manager.js";
import {BrowserAgentRunner} from "../packages/browser-agent/dist/runner.js";

const total=numberArg("--runs",10),model=textArg("--model")??process.env.NEXO_BROWSER_AGENT_MODEL??"qwen3:1.7b",ollamaUrl=textArg("--url")??process.env.NEXO_OLLAMA_URL??"http://127.0.0.1:11434";
const root=await mkdtemp(path.join(os.tmpdir(),"nexo-browser-stability-")),sessions=new BrowserAgentSessionManager(root),results=[];
try{
  for(let index=1;index<=total;index++){
    const runId=randomUUID(),started=Date.now(),events=[];let session;
    try{
      session=await sessions.create(runId,"research");
      const runner=new BrowserAgentRunner(message=>{if(message.type==="diagnostic"||message.type==="completed"||message.type==="failed")events.push(message);},async()=>false);
      await runner.run({runId,request:"Entre no site InfoMoney e resuma as principais notícias.",cdpUrl:session.cdpUrl,workspace:sessions.workspace(runId),ollamaUrl,model,mode:"research",allowedDomains:["infomoney.com.br","*.infomoney.com.br"],maxSteps:15,timeoutMs:600_000});
      const terminal=events.findLast(event=>event.type==="completed"||event.type==="failed"),firstAction=events.some(event=>event.type==="diagnostic"&&event.event==="first_action_started");
      const result={run:index,firstAction,completed:terminal?.type==="completed",errorCode:terminal?.type==="failed"?terminal.errorCode??classify(terminal.error):null,durationMs:Date.now()-started};results.push(result);console.log(JSON.stringify(result));
    }catch(error){const result={run:index,firstAction:false,completed:false,errorCode:classify(error instanceof Error?error.message:String(error)),durationMs:Date.now()-started};results.push(result);console.log(JSON.stringify(result));}
    finally{await session?.close().catch(()=>undefined);}
  }
}finally{await rm(root,{recursive:true,force:true});}
const firstActionSuccess=results.filter(item=>item.firstAction).length,completed=results.filter(item=>item.completed).length,genericErrors=results.filter(item=>item.errorCode==="BROWSER_UNKNOWN_ERROR").length,summary={ok:firstActionSuccess===total&&completed>=Math.ceil(total*.9)&&genericErrors===0,total,firstActionSuccess,completed,genericErrors,model};console.log(JSON.stringify({summary}));process.exitCode=summary.ok?0:1;
function textArg(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
function numberArg(name,fallback){const value=Number(textArg(name)??fallback);return Number.isInteger(value)&&value>0?value:fallback;}
function classify(value){const match=String(value).match(/BROWSER_[A-Z_]+/)?.[0];return match??"BROWSER_UNKNOWN_ERROR";}
