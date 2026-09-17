/** Run after pnpm --filter @nexo/core build. Uses disposable synthetic data only. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {performance,monitorEventLoopDelay} from "node:perf_hooks";
import {NexoDatabase} from "../packages/core/dist/database/db.js";
import {LocalMetricsService} from "../packages/core/dist/observability/metrics.js";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"nexo-persistence-bench-"));
const seedDir=path.join(root,"seed");
const seed=new NexoDatabase(seedDir);await seed.ready();
seed.transaction(()=>{
  for(let i=0;i<256;i++)seed.run("INSERT INTO messages VALUES(?,?,?,?,?)",[String(i),"synthetic","user","x".repeat(4096),new Date().toISOString()]);
  seed.run("INSERT INTO settings VALUES('benchmark-progress','0')");
});
const initialBytes=fs.readFileSync(path.join(seedDir,"nexo.db"));
const results=[];
try{
  for(const mode of ["per-event","buffered"]){
    const directory=path.join(root,mode);fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,"nexo.db"),initialBytes);
    const db=new NexoDatabase(directory);await db.ready();
    const exports={telemetry:0,operational:0};let category="operational",exportMs=0;
    const persist=db.persist.bind(db);
    db.persist=()=>{const started=performance.now();exports[category]++;try{return persist();}finally{exportMs+=performance.now()-started;}};
    const metrics=new LocalMetricsService(db);
    const flush=metrics.flush.bind(metrics);
    metrics.flush=()=>{const previous=category;category="telemetry";try{return flush();}finally{category=previous;}};
    const lag=monitorEventLoopDelay({resolution:10});lag.enable();await new Promise(resolve=>setTimeout(resolve,30));lag.reset();
    const started=performance.now();
    for(let i=0;i<1000;i++){
      category="telemetry";
      if(mode==="buffered")metrics.record("assistant.ipc_events",1,{kind:"token"});
      else db.run("INSERT INTO local_metrics VALUES(?,?,?,?,?)",[randomUUID(),"assistant.ipc_events",1,'{"kind":"token"}',new Date().toISOString()]);
      if(i%100===99){category="operational";db.run("UPDATE settings SET value=? WHERE key='benchmark-progress'",[String(i+1)]);}
      if(i%50===49)await new Promise(resolve=>setTimeout(resolve,0));
    }
    category="telemetry";metrics.close();const elapsedMs=performance.now()-started;
    await new Promise(resolve=>setTimeout(resolve,30));lag.disable();
    results.push({mode,events:1000,initialDatabaseBytes:initialBytes.length,exports,exportMs:Math.round(exportMs),elapsedMs:Math.round(elapsedMs),eventLoopP95Ms:Math.round(lag.percentile(95)/1e6),eventLoopMaxMs:Math.round(lag.max/1e6),samples:db.get("SELECT COUNT(*) count FROM local_metrics").count});
  }
  console.log(JSON.stringify(results,null,2));
}finally{
  // Only the exact directory created by mkdtemp above is removed.
  if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir()))throw new Error("Unexpected benchmark directory");
  fs.rmSync(root,{recursive:true,force:true});
}
