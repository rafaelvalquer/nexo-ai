import {scenarios} from "./scenarios.mjs";
const base=(process.env.OLLAMA_URL??"http://127.0.0.1:11434").replace(/\/$/,"");
const requested=(process.env.NEXO_EVAL_MODELS??"qwen3:1.7b,qwen3:4b,qwen3:8b").split(",").map(value=>value.trim()).filter(Boolean);
const timeoutMs=Math.max(5_000,Number(process.env.NEXO_EVAL_TIMEOUT_MS??120_000));
let installed=[];
try{const response=await fetch(`${base}/api/tags`,{signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);installed=((await response.json()).models??[]).map(model=>model.name);}catch(error){console.log(`Ollama indisponível em ${base}: ${error instanceof Error?error.message:String(error)}. Benchmark ignorado.`);process.exit(0);}
const models=requested.filter(model=>installed.includes(model)||installed.some(name=>name.startsWith(`${model}:`)));
if(!models.length){console.log(`Nenhum modelo solicitado está instalado. Solicitados: ${requested.join(", ")}`);process.exit(0);}
let failed=false;
for(const model of models){
  try{await fetch(`${base}/api/generate`,{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(timeoutMs*2),body:JSON.stringify({model,prompt:"",stream:false,keep_alive:"10m"})});}catch(error){console.log(JSON.stringify({model,warmup:false,error:error instanceof Error?error.message:String(error)}));}
  const totals={simple:[0,0],mutation:[0,0],multi:[0,0]};
  for(const scenario of scenarios){
    const started=performance.now();let selected="<erro>",arguments_={};
    try{const response=await fetch(`${base}/api/chat`,{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(timeoutMs),body:JSON.stringify({model,stream:false,think:false,messages:[{role:"system",content:"Escolha exatamente uma ferramenta. Preencha todos os argumentos obrigatórios usando apenas dados do pedido."},{role:"user",content:scenario.request}],tools:scenario.tools,options:{temperature:0}})});if(!response.ok)throw new Error(`HTTP ${response.status}`);const call=(await response.json()).message?.tool_calls?.[0]?.function;selected=call?.name??"<nenhuma>";arguments_=call?.arguments??{};}catch(error){selected=`<erro: ${error instanceof Error?error.message:String(error)}>`;}
    const definition=scenario.tools.find(item=>item.function.name===selected)?.function.parameters;
    const validArguments=Boolean(definition)&&definition.required.every(key=>arguments_[key]!==undefined&&arguments_[key]!=="");
    const ok=scenario.accepted.includes(selected)&&validArguments;totals[scenario.tier][1]++;if(ok)totals[scenario.tier][0]++;
    console.log(JSON.stringify({model,scenario:scenario.id,selected,arguments:arguments_,accepted:scenario.accepted,validArguments,ok,latencyMs:Math.round(performance.now()-started)}));
  }
  const ratios=Object.fromEntries(Object.entries(totals).map(([tier,[hits,total]])=>[tier,total?hits/total:1]));console.log(JSON.stringify({model,ratios,targets:{simple:.95,mutation:.90,multi:.80}}));if(ratios.simple<.95||ratios.mutation<.90||ratios.multi<.80)failed=true;
}
process.exitCode=failed?1:0;
