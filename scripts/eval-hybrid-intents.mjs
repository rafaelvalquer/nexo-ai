import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {pathToFileURL} from "node:url";

const root=process.cwd();
const coreDist=path.join(root,"packages/core/dist");
const [{HybridIntentResolver,LLMIntentParser,filesystemOperations},{OllamaProvider}]=await Promise.all([
  import(pathToFileURL(path.join(coreDist,"intent/index.js"))),
  import(pathToFileURL(path.join(coreDist,"llm/ollama.js")))
]);

const baseUrl=(process.env.NEXO_OLLAMA_URL??"http://127.0.0.1:11434").replace(/\/$/,"");
const model=process.env.NEXO_MODEL??"qwen3:4b";
const intentModel=process.env.NEXO_INTENT_MODEL??model;
const provider=new OllamaProvider(baseUrl,model,undefined,intentModel);
const health=await provider.health();
if(!health.ok){console.error(`Ollama indisponível: ${health.detail}`);process.exit(2);}

const executableFiles=[
  "filesystem-create-folder.json",
  "filesystem-create-file.json",
  "filesystem-find-file.json",
  "filesystem-list.json",
  "filesystem-write-file.json"
];
const ambiguousFile="ambiguous-cases.json";
const executable=[];
for(const file of executableFiles){
  const rows=JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents",file),"utf8"));
  for(const row of rows)executable.push({...row,file});
}
const ambiguous=(JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents",ambiguousFile),"utf8"))).map(row=>({...row,file:ambiguousFile}));

const resolver=new HybridIntentResolver(new LLMIntentParser(provider));
let operationOk=0,entityChecks=0,entityOk=0,wrongTool=0,schemaInvalid=0,unsafePathResolution=0,ambiguousSafe=0;
const latencies=[],failures=[];

for(const [index,row] of [...executable,...ambiguous].entries()){
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
    if(safe)ambiguousSafe++;
    else failures.push({input:row.input,file:row.file,expected:"clarification_or_unknown",actual:summarize(result)});
  }
  process.stdout.write(`\rHybrid Intent Evaluation ${index+1}/${executable.length+ambiguous.length}`);
}
process.stdout.write("\n");

const operationAccuracy=ratio(operationOk,executable.length);
const entityAccuracy=ratio(entityOk,entityChecks);
const wrongToolRate=ratio(wrongTool,executable.length);
const schemaInvalidRate=ratio(schemaInvalid,executable.length+ambiguous.length);
const ambiguitySafety=ratio(ambiguousSafe,ambiguous.length);
const sorted=[...latencies].sort((a,b)=>a-b);
const p95=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??0;

console.log(`Model: ${intentModel} (fallback: ${model})`);
console.log(`Executable cases: ${executable.length}`);
console.log(`Ambiguous/negative cases: ${ambiguous.length}`);
console.log(`Operation accuracy: ${pct(operationAccuracy)}`);
console.log(`Entity accuracy: ${pct(entityAccuracy)}`);
console.log(`Wrong tool rate: ${pct(wrongToolRate)}`);
console.log(`Schema invalid rate: ${pct(schemaInvalidRate)}`);
console.log(`Ambiguity/negative safety: ${pct(ambiguitySafety)}`);
console.log(`Unsafe invented path resolutions: ${unsafePathResolution}`);
console.log(`P95 resolver latency: ${Math.round(p95)} ms`);
if(failures.length){console.log(`\nFailures: ${failures.length}`);console.log(JSON.stringify(failures.slice(0,30),null,2));}

const success=
  operationAccuracy>=.98&&
  entityAccuracy>=.97&&
  wrongToolRate<=.005&&
  schemaInvalidRate<=.01&&
  ambiguitySafety===1&&
  unsafePathResolution===0;
process.exit(success?0:1);

function ratio(value,total){return total?value/total:1;}
function pct(value){return `${(value*100).toFixed(2)}%`;}
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
