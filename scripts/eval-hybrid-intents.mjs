import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {pathToFileURL} from "node:url";

const root=process.cwd(),coreDist=path.join(root,"packages/core/dist"),artifactsDir=path.join(root,"artifacts");
await fs.mkdir(artifactsDir,{recursive:true});
const reportPath=path.join(artifactsDir,"hybrid-intent-eval.json");

const [{HybridIntentResolver,LLMIntentParser,IntentToolMapper,filesystemOperations},{OllamaProvider},{ToolRegistry}]=await Promise.all([
  import(pathToFileURL(path.join(coreDist,"intent/index.js"))),
  import(pathToFileURL(path.join(coreDist,"llm/ollama.js"))),
  import(pathToFileURL(path.join(coreDist,"tools/registry.js")))
]);

const baseUrl=(process.env.NEXO_MODEL_EVAL_URL??process.env.NEXO_OLLAMA_URL??"http://127.0.0.1:11434").replace(/\/$/,"");
const model=process.env.NEXO_MODEL_EVAL_MODEL??process.env.NEXO_MODEL??"qwen3:0.6b";
const intentModel=process.env.NEXO_INTENT_MODEL??model,maxP95=Number(process.env.NEXO_INTENT_P95_MAX_MS??1500);
const provider=new OllamaProvider(baseUrl,model,undefined,intentModel),health=await provider.health();
if(!health.ok){await writeReport({model:intentModel,error:`Ollama indisponível: ${health.detail}`});console.error(`Ollama indisponível: ${health.detail}`);process.exit(2);}

const datasetFiles=["filesystem-create-folder.json","filesystem-create-file.json","filesystem-find-file.json","filesystem-list.json","filesystem-write-file.json","ambiguous-cases.json","filesystem-real-world-regressions.json","filesystem-manual-regressions-v2.json"];
const byInput=new Map();
for(const file of datasetFiles){
  for(const original of JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents",file),"utf8"))){
    const row=normalizeRow({...original,file}),existing=byInput.get(row.input);
    if(!existing||(!existing.operation&&row.operation))byInput.set(row.input,row);
  }
}
const rows=[...byInput.values()],registry=new ToolRegistry(),evalRoot=path.join(root,".hybrid-eval","Downloads"),mapper=new IntentToolMapper(registry,()=>[evalRoot]);
const request=text=>({text,allowedDomains:["filesystem"],availableOperations:[...filesystemOperations]});
const warmups=["procure teste.txt","crie uma pasta teste em downloads","troque o conteúdo do teste.txt por abc"];
// O gate precisa medir todos os casos reais. O circuit breaker continua ativo em produção,
// mas não pode transformar cinco erros iniciais em 100+ resultados HYBRID_INTENT_CIRCUIT_OPEN.
const resolver=new HybridIntentResolver(new LLMIntentParser(provider),undefined,rows.length+warmups.length+10,0);
for(const text of warmups){const result=await resolver.resolve(request(text));if(result.status==="resolved")mapper.map(result.intent);}

let operationOk=0,entityChecks=0,entityOk=0,wrongTool=0,schemaInvalid=0,unsafePathResolution=0,safeNonExecutable=0;
const totalLatencies=[],resolverLatencies=[],parserLatencies=[],validationLatencies=[],mapperLatencies=[],failures=[];
const executableRows=rows.filter(row=>row.operation),nonExecutableRows=rows.filter(row=>!row.operation);

for(const [index,row] of rows.entries()){
  const totalStarted=performance.now(),resolverStarted=performance.now(),result=await resolver.resolve(request(row.input)),resolverElapsed=performance.now()-resolverStarted;
  let mapperElapsed=0,mapped;
  if(result.status==="resolved"){const mapperStarted=performance.now();mapped=mapper.map(result.intent);mapperElapsed=performance.now()-mapperStarted;}
  const totalElapsed=performance.now()-totalStarted,diagnostics=resolver.diagnostics();
  totalLatencies.push(totalElapsed);resolverLatencies.push(resolverElapsed);parserLatencies.push(diagnostics?.parserMs??0);validationLatencies.push(diagnostics?.validationMs??0);mapperLatencies.push(mapperElapsed);

  if(row.operation){
    const operation=result.status==="resolved"&&result.intent.operation===row.operation;if(operation)operationOk++;
    if(result.status==="resolved"&&result.intent.operation!==row.operation)wrongTool++;
    if(result.status==="unknown"&&["LLM_INTENT_PARSE_FAILED","INVALID_INTENT_SCHEMA"].includes(result.reason))schemaInvalid++;
    for(const [key,expected] of Object.entries(row.entities??{})){entityChecks++;const actual=result.status!=="unknown"?result.intent.entities?.[key]?.value:undefined;if(entityEquivalent(key,actual,expected))entityOk++;}
    if(result.status==="resolved"&&hasUnsafeInventedPath(result.intent,row.input))unsafePathResolution++;
    if(!operation||!entitiesMatch(result,row.entities??{}))failures.push({input:row.input,file:row.file,expected:{operation:row.operation,entities:row.entities},actual:summarize(result),mapped:summarizeMapped(mapped)});
  }else{
    const safe=result.status==="clarification"||result.status==="unknown";if(safe)safeNonExecutable++;else failures.push({input:row.input,file:row.file,expected:row.expectedStatus??"clarification_or_unknown",actual:summarize(result),mapped:summarizeMapped(mapped)});
  }
  process.stdout.write(`\rHybrid Intent Evaluation ${index+1}/${rows.length}`);
}
process.stdout.write("\n");

const operationAccuracy=ratio(operationOk,executableRows.length),entityAccuracy=ratio(entityOk,entityChecks),wrongToolRate=ratio(wrongTool,executableRows.length),schemaInvalidRate=ratio(schemaInvalid,rows.length),ambiguitySafety=ratio(safeNonExecutable,nonExecutableRows.length);
const totalStats=stats(totalLatencies),resolverStats=stats(resolverLatencies),parserStats=stats(parserLatencies),validationStats=stats(validationLatencies),mapperStats=stats(mapperLatencies);
const report={model:intentModel,cases:rows.length,executableCases:executableRows.length,nonExecutableCases:nonExecutableRows.length,operationAccuracy,entityAccuracy,wrongToolRate,schemaInvalidRate,ambiguitySafety,unsafeInventedPaths:unsafePathResolution,latency:{totalMs:totalStats,resolverMs:resolverStats,parserModelMs:parserStats,validationMs:validationStats,mapperMs:mapperStats},p50Ms:Math.round(totalStats.p50),p90Ms:Math.round(totalStats.p90),p95Ms:Math.round(totalStats.p95),maxMs:Math.round(totalStats.max),maxP95Ms:maxP95,warmupCases:warmups.length,failures:failures.slice(0,75)};
await writeReport(report);
console.log(`Model: ${intentModel}`);console.log(`Cases: ${rows.length}`);console.log(`Operation accuracy: ${pct(operationAccuracy)}`);console.log(`Entity accuracy: ${pct(entityAccuracy)}`);console.log(`Wrong tool rate: ${pct(wrongToolRate)}`);console.log(`Schema invalid rate: ${pct(schemaInvalidRate)}`);console.log(`Ambiguity/negative safety: ${pct(ambiguitySafety)}`);console.log(`Unsafe invented paths: ${unsafePathResolution}`);console.log(`Latency total P50/P90/P95/max: ${Math.round(totalStats.p50)}/${Math.round(totalStats.p90)}/${Math.round(totalStats.p95)}/${Math.round(totalStats.max)} ms`);console.log(`Parser/model P95: ${Math.round(parserStats.p95)} ms; validation P95: ${Math.round(validationStats.p95)} ms; mapper P95: ${Math.round(mapperStats.p95)} ms`);console.log(`Report: ${reportPath}`);
if(failures.length){console.log(`\nFailures: ${failures.length}`);console.log(JSON.stringify(failures.slice(0,40),null,2));}
const success=operationAccuracy>=.98&&entityAccuracy>=.97&&wrongToolRate<=.005&&schemaInvalidRate<=.01&&ambiguitySafety===1&&unsafePathResolution===0&&totalStats.p95<=maxP95;process.exit(success?0:1);

function normalizeRow(row){
  if(row.expectedOperation&&!row.operation)row.operation=row.expectedOperation;
  if(row.expectedContent!==undefined&&row.operation==="create_text_file"){const name=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1];row.entities={name,folder:row.expectedScope??"downloads",content:row.expectedContent};}
  if(row.expectedContent!==undefined&&row.operation==="write_text_file"){const file=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1];row.entities={file,content:row.expectedContent};}
  if(row.operation==="find_file"&&!row.entities){const name=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1];row.entities={name,...(row.expectedScope?{folder:row.expectedScope}:{})};}
  if(row.operation==="list_files"&&!row.entities)row.entities={folder:row.expectedScope??"downloads"};
  if(row.operation==="create_folder"&&!row.entities){const name=row.input.includes("Projeto Nexo")?"Projeto Nexo":row.input.includes("Experimentos")?"Experimentos":"teste";row.entities={name,folder:row.expectedScope??"downloads"};}
  if(row.operation==="create_text_file"&&!row.entities){const name=row.input.match(/([\p{L}\p{N}_-]+\.txt)/u)?.[1];row.entities={name,folder:row.expectedScope??"downloads"};}
  if(row.expectedExecutable===false&&!row.expectedOperation)delete row.operation;
  return row;
}
async function writeReport(value){await fs.writeFile(reportPath,JSON.stringify(value,null,2)+"\n","utf8");}
function ratio(value,total){return total?value/total:1;}function pct(value){return `${(value*100).toFixed(2)}%`;}function percentile(sorted,p){if(!sorted.length)return 0;return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0;}function stats(values){const sorted=[...values].sort((a,b)=>a-b);return{p50:percentile(sorted,.50),p90:percentile(sorted,.90),p95:percentile(sorted,.95),max:sorted.at(-1)??0};}
function canonicalAlias(value){const normalized=String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();if(["download","downloads","meus downloads","pasta downloads","pasta download"].includes(normalized))return"downloads";if(["document","documents","documento","documentos","meus documentos"].includes(normalized))return"documents";if(["desktop","area de trabalho"].includes(normalized))return"desktop";return normalized;}
function entityEquivalent(key,actual,expected){if(key==="folder")return canonicalAlias(actual)===canonicalAlias(expected);if(Array.isArray(actual)||Array.isArray(expected))return JSON.stringify(actual)===JSON.stringify(expected);return String(actual??"").normalize("NFKC").trim()===String(expected??"").normalize("NFKC").trim();}
function entitiesMatch(result,expected){if(result.status==="unknown")return Object.keys(expected).length===0;return Object.entries(expected).every(([key,value])=>entityEquivalent(key,result.intent.entities?.[key]?.value,value));}
function hasUnsafeInventedPath(intent,input){const normalized=input.replace(/\//g,"\\").replace(/[\\]+/g,"\\").toLowerCase();for(const key of["path","source","destination"]){const value=intent.entities?.[key]?.value;if(typeof value!=="string")continue;if(!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value))continue;const candidate=value.replace(/\//g,"\\").replace(/[\\]+/g,"\\").toLowerCase();if(!normalized.includes(candidate))return true;}return false;}
function summarize(result){if(result.status==="unknown")return{status:result.status,reason:result.reason,...(result.intent?{domain:result.intent.domain,operation:result.intent.operation,entities:Object.fromEntries(Object.entries(result.intent.entities).map(([key,item])=>[key,item.value])),confidence:result.confidence?.overall}: {})};return{status:result.status,domain:result.intent.domain,operation:result.intent.operation,entities:Object.fromEntries(Object.entries(result.intent.entities).map(([key,item])=>[key,item.value])),confidence:result.confidence.overall};}
function summarizeMapped(mapped){if(!mapped)return undefined;return mapped.type==="tool"?{type:mapped.type,tool:mapped.tool,deferredAction:mapped.deferredAction?.kind}:mapped.type==="clarification"?{type:mapped.type,question:mapped.question}:{type:mapped.type,reason:mapped.reason};}
