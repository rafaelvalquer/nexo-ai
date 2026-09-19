import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {pathToFileURL} from "node:url";

const root=process.cwd();
const coreDist=path.join(root,"packages/core/dist");
const artifactsDir=path.join(root,"artifacts");
await fs.mkdir(artifactsDir,{recursive:true});
const reportPath=path.join(artifactsDir,"hybrid-intent-eval.json");

const [{HybridIntentResolver,LLMIntentParser,filesystemOperations},{OllamaProvider}]=await Promise.all([
  import(pathToFileURL(path.join(coreDist,"intent/index.js"))),
  import(pathToFileURL(path.join(coreDist,"llm/ollama.js")))
]);

const baseUrl=(process.env.NEXO_MODEL_EVAL_URL??process.env.NEXO_OLLAMA_URL??"http://127.0.0.1:11434").replace(/\/$/,"");
const model=process.env.NEXO_MODEL_EVAL_MODEL??process.env.NEXO_MODEL??"qwen3:4b";
const intentModel=process.env.NEXO_INTENT_MODEL??model;
const maxP95=Number(process.env.NEXO_INTENT_P95_MAX_MS??1500);
const provider=new OllamaProvider(baseUrl,model,undefined,intentModel);
const health=await provider.health();
if(!health.ok){
  await writeReport({model:intentModel,error:`Ollama indisponível: ${health.detail}`});
  console.error(`Ollama indisponível: ${health.detail}`);
  process.exit(2);
}

const baseFiles=[
  "filesystem-create-folder.json",
  "filesystem-create-file.json",
  "filesystem-find-file.json",
  "filesystem-list.json",
  "filesystem-write-file.json"
];
const rows=[];
for(const file of baseFiles){
  for(const row of JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents",file),"utf8")))rows.push({...row,file,executable:true});
}
for(const row of JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents","ambiguous-cases.json"),"utf8")))rows.push({...row,file:"ambiguous-cases.json",executable:false});
for(const row of JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents","filesystem-real-world-regressions.json"),"utf8")))rows.push({...row,file:"filesystem-real-world-regressions.json"});

const resolver=new HybridIntentResolver(new LLMIntentParser(provider));
const warmups=[
  "procure teste.txt",
  "crie uma pasta teste em downloads",
  "troque o conteúdo do teste.txt por abc"
];
for(const text of warmups)await resolver.resolve({text,allowedDomains:["filesystem"],availableOperations:[...filesystemOperations]});

let operationOk=0,entityChecks=0,entityOk=0,wrongTool=0,schemaInvalid=0,unsafePathResolution=0,safeNonExecutable=0;
const latencies=[],failures=[];
const executableRows=rows.filter(row=>row.operation);
const nonExecutableRows=rows.filter(row=>!row.operation);

for(const [index,row] of rows.entries()){
  const started=performance.now();
  const result=await resolver.resolve({text:row.input,allowedDomains:["filesystem"],availableOperations:[...filesystemOperations]});
  latencies.push(performance.now()-started);

  if(row.operation){
    const operation=result.status==="resolved"&&result.intent.operation===row.operation;
    if(operation)operationOk++;
    if(result.status==="resolved"&&result.intent.operation!==row.operation)wrongTool++;
    if(result.status==="unknown"&&["LLM_INTENT_PARSE_FAILED","INVALID_INTENT_SCHEMA"].includes(result.reason))schemaInvalid++;
    for(const [key,expected] of Object.entries(row.entities??{})){
      entityChecks++;
      const actual=result.status!=="unknown"?result.intent.entities?.[key]?.value:undefined;
      if(entityEquivalent(key,actual,expected))entityOk++;
    }
    if(result.status==="resolved"&&hasUnsafeInventedPath(result.intent,row.input))unsafePathResolution++;
    if(!operation||!entitiesMatch(result,row.entities??{}))failures.push({input:row.input,file:row.file,expected:{operation:row.operation,entities:row.entities},actual:summarize(result)});
  }else{
    const safe=result.status==="clarification"||result.status==="unknown";
    if(safe)safeNonExecutable++;
    else failures.push({input:row.input,file:row.file,expected:row.expectedStatus??"clarification_or_unknown",actual:summarize(result)});
  }
  process.stdout.write(`\rHybrid Intent Evaluation ${index+1}/${rows.length}`);
}
process.stdout.write("\n");

const operationAccuracy=ratio(operationOk,executableRows.length);
const entityAccuracy=ratio(entityOk,entityChecks);
const wrongToolRate=ratio(wrongTool,executableRows.length);
const schemaInvalidRate=ratio(schemaInvalid,rows.length);
const ambiguitySafety=ratio(safeNonExecutable,nonExecutableRows.length);
const sorted=[...latencies].sort((a,b)=>a-b);
const p50=percentile(sorted,.50),p95=percentile(sorted,.95);

const report={
  model:intentModel,
  cases:rows.length,
  executableCases:executableRows.length,
  nonExecutableCases:nonExecutableRows.length,
  operationAccuracy,
  entityAccuracy,
  wrongToolRate,
  schemaInvalidRate,
  ambiguitySafety,
  unsafeInventedPaths:unsafePathResolution,
  p50Ms:Math.round(p50),
  p95Ms:Math.round(p95),
  maxP95Ms:maxP95,
  warmupCases:warmups.length,
  failures:failures.slice(0,50)
};
await writeReport(report);

console.log(`Model: ${intentModel}`);
console.log(`Cases: ${rows.length}`);
console.log(`Operation accuracy: ${pct(operationAccuracy)}`);
console.log(`Entity accuracy: ${pct(entityAccuracy)}`);
console.log(`Wrong tool rate: ${pct(wrongToolRate)}`);
console.log(`Schema invalid rate: ${pct(schemaInvalidRate)}`);
console.log(`Ambiguity/negative safety: ${pct(ambiguitySafety)}`);
console.log(`Unsafe invented paths: ${unsafePathResolution}`);
console.log(`P50 resolver latency: ${Math.round(p50)} ms`);
console.log(`P95 resolver latency: ${Math.round(p95)} ms (max ${maxP95} ms)`);
console.log(`Report: ${reportPath}`);
if(failures.length){console.log(`\nFailures: ${failures.length}`);console.log(JSON.stringify(failures.slice(0,30),null,2));}

const success=
  operationAccuracy>=.98&&
  entityAccuracy>=.97&&
  wrongToolRate<=.005&&
  schemaInvalidRate<=.01&&
  ambiguitySafety===1&&
  unsafePathResolution===0&&
  p95<=maxP95;
process.exit(success?0:1);

async function writeReport(value){await fs.writeFile(reportPath,JSON.stringify(value,null,2)+"\n","utf8");}
function ratio(value,total){return total?value/total:1;}
function pct(value){return `${(value*100).toFixed(2)}%`;}
function percentile(sorted,p){if(!sorted.length)return 0;return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0;}
function canonicalAlias(value){
  const normalized=String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  if(["download","downloads","meus downloads","pasta downloads","pasta download"].includes(normalized))return"downloads";
  if(["document","documents","documento","documentos","meus documentos"].includes(normalized))return"documents";
  if(["desktop","area de trabalho"].includes(normalized))return"desktop";
  return normalized;
}
function entityEquivalent(key,actual,expected){
  if(key==="folder")return canonicalAlias(actual)===canonicalAlias(expected);
  if(Array.isArray(actual)||Array.isArray(expected))return JSON.stringify(actual)===JSON.stringify(expected);
  return String(actual??"").normalize("NFKC").trim()===String(expected??"").normalize("NFKC").trim();
}
function entitiesMatch(result,expected){
  if(result.status==="unknown")return Object.keys(expected).length===0;
  return Object.entries(expected).every(([key,value])=>entityEquivalent(key,result.intent.entities?.[key]?.value,value));
}
function hasUnsafeInventedPath(intent,input){
  const normalized=input.replace(/\//g,"\\").replace(/[\\]+/g,"\\").toLowerCase();
  for(const key of ["path","source","destination"]){
    const value=intent.entities?.[key]?.value;
    if(typeof value!=="string")continue;
    if(!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value))continue;
    const candidate=value.replace(/\//g,"\\").replace(/[\\]+/g,"\\").toLowerCase();
    if(!normalized.includes(candidate))return true;
  }
  return false;
}
function summarize(result){
  if(result.status==="unknown")return{status:result.status,reason:result.reason};
  return{status:result.status,operation:result.intent.operation,entities:Object.fromEntries(Object.entries(result.intent.entities).map(([key,item])=>[key,item.value])),confidence:result.confidence.overall};
}
