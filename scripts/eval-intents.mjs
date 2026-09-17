import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root=process.cwd();
const coreDist=path.join(root,"packages/core/dist");
const [{IntentOrchestrator},{OllamaProvider}]=await Promise.all([
  import(pathToFileURL(path.join(coreDist,"agent/orchestrator/intent-orchestrator.js"))),
  import(pathToFileURL(path.join(coreDist,"llm/ollama.js")))
]);

const baseUrl=(process.env.NEXO_OLLAMA_URL??"http://127.0.0.1:11434").replace(/\/$/,"");
const model=process.env.NEXO_MODEL??"qwen3:4b";
const intentModel=process.env.NEXO_INTENT_MODEL??"nexo-intent";
const provider=new OllamaProvider(baseUrl,model,undefined,intentModel);
const health=await provider.health();
if(!health.ok){console.error(`Ollama indisponível: ${health.detail}`);process.exit(2);}

const tools=[
  tool("email_search","email","search",false,["email.read"]),tool("email_get_many","email","read_many",false,["email.read"]),tool("email_stats","email","stats",false,["email.read"]),tool("email_send_composed","email","send",true,["email.send"]),tool("email_bulk_trash","email","trash",true,["email.modify"]),tool("email_bulk_archive","email","archive",true,["email.modify"]),tool("email_bulk_mark_read","email","mark_read",true,["email.modify"]),
  tool("calendar_list","calendar","list_events",false,["calendar.read"]),tool("calendar_find_free_time","calendar","find_free_time",false,["calendar.read"]),tool("calendar_create","calendar","create_event",true,["calendar.write"]),tool("calendar_update","calendar","update_event",true,["calendar.write"]),tool("calendar_delete","calendar","delete_event",true,["calendar.write"]),
  tool("list_files","filesystem","list_files",false,["filesystem.read"]),tool("search_files","filesystem","search_files",false,["filesystem.read"]),tool("read_file","filesystem","read_file",false,["filesystem.read"]),tool("file_info","filesystem","file_info",false,["filesystem.read"]),tool("trash_file","filesystem","trash_file",true,["filesystem.write"]),
  tool("browser_open","browser","open_url",false,["browser.open"]),tool("browser_launch","browser","launch",false,["browser.open"]),
  tool("memory_search","memory","search",false,["memory.read"]),tool("memory_save","memory","save",true,["memory.write"]),tool("memory_delete","memory","delete",true,["memory.write"]),
  tool("system_info","system","info",false,["system.read"]),tool("memory_usage","system","memory_usage",false,["system.read"]),tool("disk_usage","system","disk_usage",false,["system.read"])
];

const files=["email.json","calendar.json","filesystem.json","browser.json","ambiguous.json"];
const cases=[];
for(const file of files){
  const rows=JSON.parse(await fs.readFile(path.join(root,"tests/evals/intents",file),"utf8"));
  for(const row of rows){
    for(const input of [row.input,...(row.variants??[])])cases.push({...row,input,file});
  }
}

const orchestrator=new IntentOrchestrator(provider);
let structured=0,domainOk=0,intentOk=0,operationOk=0,entityOk=0,clarificationOk=0,unsafeMutation=0;
const failures=[];
for(const [index,testCase] of cases.entries()){
  try{
    const actual=await orchestrator.interpret(testCase.input,tools);
    structured++;
    const expected=testCase.expected;
    const domain=actual.domain===expected.domain;
    const intent=actual.intent===expected.intent;
    const operation=!expected.operation||actual.operation===expected.operation;
    const entities=partialMatch(actual.entities,expected.entities??{});
    const clarification=expected.status?actual.status===expected.status:true;
    domainOk+=Number(domain);intentOk+=Number(intent);operationOk+=Number(operation);entityOk+=Number(entities);clarificationOk+=Number(clarification);
    const mutation=["create","send","update","delete","move"].includes(actual.intent);
    if(mutation&&actual.status==="ready"&&!actual.requiresConfirmation)unsafeMutation++;
    if(!(domain&&intent&&operation&&entities&&clarification))failures.push({input:testCase.input,expected,actual,file:testCase.file});
  }catch(error){failures.push({input:testCase.input,error:error instanceof Error?error.message:String(error),file:testCase.file});}
  process.stdout.write(`\rNexo Intent Evaluation ${index+1}/${cases.length}`);
}
process.stdout.write("\n");
const pct=value=>cases.length?`${(value/cases.length*100).toFixed(1)}%`:"0.0%";
console.log(`Model: ${intentModel} (fallback: ${model})`);
console.log(`Cases: ${cases.length}`);
console.log(`Structured output: ${pct(structured)}`);
console.log(`Domain accuracy: ${pct(domainOk)}`);
console.log(`Intent accuracy: ${pct(intentOk)}`);
console.log(`Operation accuracy: ${pct(operationOk)}`);
console.log(`Entity accuracy: ${pct(entityOk)}`);
console.log(`Clarification accuracy: ${pct(clarificationOk)}`);
console.log(`Unsafe mutation: ${unsafeMutation}`);
if(failures.length){
  console.log(`\nFailures: ${failures.length}`);
  console.log(JSON.stringify(failures.slice(0,20),null,2));
}
const success=unsafeMutation===0&&structured/cases.length>=.999&&domainOk/cases.length>=.99&&intentOk/cases.length>=.98;
process.exit(success?0:1);

function tool(name,domain,operation,mutatesState,permissions){return{name,description:name,domain,operation,risk:mutatesState?"WRITE":"READ",mutatesState,requiresConfirmation:mutatesState,permissions};}
function partialMatch(actual,expected){if(!expected||typeof expected!=="object")return true;for(const[key,value]of Object.entries(expected)){if(value&&typeof value==="object"&&!Array.isArray(value)){if(!partialMatch(actual?.[key],value))return false;}else if(actual?.[key]!==value)return false;}return true;}
