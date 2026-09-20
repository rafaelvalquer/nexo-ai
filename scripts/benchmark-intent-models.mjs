import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {spawn} from "node:child_process";

const root=process.cwd(),baseUrl=(process.env.NEXO_MODEL_EVAL_URL??"http://127.0.0.1:11434").replace(/\/$/,"");
const models=(process.env.NEXO_INTENT_MODELS??"qwen3:0.6b,qwen3:1.7b,qwen3:4b").split(",").map(value=>value.trim()).filter(Boolean);
const outDir=path.join(root,"artifacts","intent-models");await fs.mkdir(outDir,{recursive:true});
const comparisons=[];

for(const model of models){
  console.log(`\n=== Benchmark ${model} ===`);
  await pull(model);
  const safeName=model.replace(/[^a-z0-9.-]+/gi,"-").replace(/[.:]/g,"-");
  const reportPath=path.join(outDir,`${safeName}.json`);
  const exitCode=await runEval(model,reportPath);
  const report=JSON.parse(await fs.readFile(reportPath,"utf8"));
  const sizeBytes=await modelSize(model);
  comparisons.push({
    model,
    exitCode,
    sizeBytes,
    operationAccuracy:report.operationAccuracy,
    entityAccuracy:report.entityAccuracy,
    wrongToolRate:report.wrongToolRate,
    schemaInvalidRate:report.schemaInvalidRate,
    ambiguitySafety:report.ambiguitySafety,
    timeoutRate:report.timeoutRate,
    modelErrorRate:report.modelErrorRate,
    warmP95:report.warmP95,
    coldStartMs:report.coldStartMs
  });
}
comparisons.sort((a,b)=>
  (b.ambiguitySafety??0)-(a.ambiguitySafety??0) ||
  (a.wrongToolRate??1)-(b.wrongToolRate??1) ||
  (b.operationAccuracy??0)-(a.operationAccuracy??0) ||
  (b.entityAccuracy??0)-(a.entityAccuracy??0) ||
  ((a.timeoutRate??0)+(a.modelErrorRate??0))-((b.timeoutRate??0)+(b.modelErrorRate??0)) ||
  (a.warmP95??Infinity)-(b.warmP95??Infinity) ||
  (a.sizeBytes??Infinity)-(b.sizeBytes??Infinity)
);
const comparison={models,ranking:comparisons,selectedCandidate:comparisons[0]?.model??null,selectionNote:"Ranking técnico; não altera automaticamente o modelo padrão. Validar RAM/VRAM no runner representativo antes da decisão final."};
await fs.writeFile(path.join(outDir,"comparison.json"),JSON.stringify(comparison,null,2)+"\n","utf8");
console.log(JSON.stringify(comparison,null,2));

async function pull(model){
  const response=await fetch(`${baseUrl}/api/pull`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model,stream:false})});
  if(!response.ok)throw new Error(`Falha ao baixar ${model}: HTTP ${response.status} ${await response.text()}`);
}
async function modelSize(model){
  const response=await fetch(`${baseUrl}/api/tags`);if(!response.ok)return undefined;
  const data=await response.json();return data.models?.find(item=>item.name===model||item.name===`${model}:latest`)?.size;
}
function runEval(model,reportPath){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,"scripts","eval-hybrid-intents.mjs")],{
      cwd:root,stdio:"inherit",
      env:{...process.env,NEXO_MODEL_EVAL_MODEL:model,NEXO_INTENT_MODEL:model,NEXO_INTENT_REPORT_PATH:reportPath,NEXO_INTENT_GATE_MODE:"benchmark",NEXO_INTENT_TIMEOUT_MS:process.env.NEXO_INTENT_TIMEOUT_MS??"10000"}
    });
    child.on("error",reject);child.on("exit",code=>resolve(code??1));
  });
}
