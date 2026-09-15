import{OllamaProvider}from"../packages/core/dist/llm/ollama.js";
const baseUrl=process.env.NEXO_MODEL_EVAL_URL?.replace(/\/$/,"")||"http://127.0.0.1:11434",model=process.env.NEXO_MODEL_EVAL_MODEL||"qwen3:4b";
const health=await fetch(`${baseUrl}/api/tags`).catch(()=>undefined);if(!health?.ok)throw new Error(`Ollama real indisponível em ${baseUrl}. Defina NEXO_MODEL_EVAL_URL para o ambiente controlado.`);
const tools=[tool("email_latest",{}),tool("email_search",{maxResults:{type:"integer"}}),tool("list_files",{path:{type:"string"},kind:{enum:["all","file","directory"]},sortBy:{enum:["name","modifiedAt","size"]},sortDirection:{enum:["asc","desc"]},limit:{type:"integer"}}),tool("create_folder",{path:{type:"string"}}),tool("search_files",{path:{type:"string"},query:{type:"string"}}),tool("file_info",{path:{type:"string"}}),tool("system_info",{}),tool("memory_usage",{}),tool("calendar_list",{start:{type:"string"},end:{type:"string"}})];
const cases=[
  ["Qual foi o último e-mail que recebi?","email_latest",false],
  ["Resuma meus últimos 5 e-mails.","email_search",false],
  ["Liste os 5 arquivos mais recentes da pasta Downloads.","list_files",false],
  ["Crie uma pasta chamada TesteAgente dentro de Downloads.","create_folder",true],
  ["Busque arquivos Nexo e compare as datas.","search_files",false],
  ["Dos arquivos anteriores, qual deles é o segundo?","file_info",false],
  ["Quanto de memória RAM meu computador tem?","system_info",false],
  ["Quanto dela está sendo usada agora?","memory_usage",false],
  ["O que tenho na agenda amanhã?","calendar_list",false]
];
const provider=new OllamaProvider(baseUrl,model);let selected=0,unnecessary=0,mutationViolations=0;const rows=[];
for(const[prompt,expected,mutation]of cases){const result=await provider.agentTurn({model,messages:[{role:"system",content:"Você é o Agent V2 do Nexo. Escolha exatamente uma ferramenta. Não invente alteração de estado."},{role:"user",content:prompt}],tools});const calls=result.toolCalls??[],actual=calls[0]?.name??"final",ok=calls.length===1&&actual===expected;selected+=Number(ok);unnecessary+=Math.max(0,calls.length-1);if(!mutation&&["create_folder"].includes(actual))mutationViolations++;rows.push({prompt,expected,actual,toolCalls:calls.length,ok});}
const metrics={taskSuccess:selected/cases.length,toolSelectionAccuracy:selected/cases.length,unnecessaryToolCalls:unnecessary,mutationSafety:mutationViolations===0};console.log(JSON.stringify({model,metrics,rows},null,2));if(metrics.taskSuccess<.75||unnecessary||mutationViolations)process.exitCode=1;
function tool(name,properties){return{name,description:`Ferramenta ${name}`,parameters:{type:"object",properties,additionalProperties:false}};}
