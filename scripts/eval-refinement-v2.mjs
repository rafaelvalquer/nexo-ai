import fs from "node:fs";
import path from "node:path";
import {DomainEvidenceBuilder,compatibleDomainEvidence} from "../packages/core/dist/intent/domain/domain-evidence-builder.js";
import {parseOperationEntities} from "../packages/core/dist/intent/entities/operation-parser.js";
import {HardVetoMatrix} from "../packages/core/dist/agent/decision/hard-veto-matrix.js";

const root=process.cwd(),rows=JSON.parse(fs.readFileSync(path.join(root,"tests/evals/intents/refinement-v2-1000.json"),"utf8"));
if(rows.length<1000)fail(`dataset_too_small:${rows.length}`);
const required=["filesystem","web","email","calendar","documents","browser","system","typo","cross-domain","multi-turn","multi-step","correction","ambiguity"];
const categories=new Set(rows.map(row=>row.category));
for(const category of required)if(!categories.has(category))fail(`missing_category:${category}`);

const builder=new DomainEvidenceBuilder(),veto=new HardVetoMatrix();
let domainTotal=0,domainOk=0,crossTotal=0,crossOk=0,webToFilesystem=0,unsafeFilesystemWeb=0,parserChecks=0,parserOk=0;
const failures=[];
for(const row of rows){
  const evidence=builder.build(row.prompt);
  if(singleTurnDomainRow(row)){
    domainTotal++;
    const actual=evidence.top?.domain??"unknown";
    const ok=domainCompatible(row.expectedDomain,actual);
    if(ok)domainOk++;else failures.push({kind:"domain",id:row.id,prompt:row.prompt,expected:row.expectedDomain,actual,evidence:evidence.items});
    if(row.category==="cross-domain"){crossTotal++;if(ok)crossOk++;}
  }
  if(row.expectedDomain==="filesystem"){
    const web=evidence.items.find(item=>item.domain==="web"||item.domain==="browser")?.score??0;
    const fsScore=evidence.items.find(item=>item.domain==="filesystem")?.score??0;
    if(web>fsScore)webToFilesystem++;
    if(row.mustNotDomain==="web"){
      const fake={source:"web",domain:"web",operation:"web_research",entities:{query:row.prompt},missing:[],ambiguities:[],confidence:.99,proposedTool:"web_research",mutatesState:false,evidence:[]};
      if(!veto.evaluate(row.prompt,fake,evidence).veto)unsafeFilesystemWeb++;
    }
  }
  if(row.expectedOperation==="write_text_file"){
    parserChecks++;
    const entities=parseOperationEntities("write_text_file",row.prompt).entities;
    const hasFilename=typeof entities.file==="string"&&String(entities.file).includes(".");
    const hasContent=typeof entities.content==="string"&&String(entities.content).length>0;
    if(hasFilename&&hasContent)parserOk++;else failures.push({kind:"entity_parser",id:row.id,prompt:row.prompt,entities});
  }
}
const domainAccuracy=ratio(domainOk,domainTotal),crossDomainAccuracy=ratio(crossOk,crossTotal),parserAccuracy=ratio(parserOk,parserChecks);
const report={cases:rows.length,domainCases:domainTotal,domainAccuracy,crossDomainCases:crossTotal,crossDomainAccuracy,webToFilesystem,unsafeFilesystemWeb,parserChecks,parserAccuracy,failures:failures.slice(0,100)};
fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});fs.writeFileSync(path.join(root,"artifacts/refinement-v2-eval.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
const errors=[];
if(domainAccuracy<.995)errors.push(`domainAccuracy ${pct(domainAccuracy)} < 99.5%`);
if(crossTotal&&crossDomainAccuracy<.995)errors.push(`crossDomainAccuracy ${pct(crossDomainAccuracy)} < 99.5%`);
if(webToFilesystem!==0)errors.push(`webToFilesystem=${webToFilesystem}`);
if(unsafeFilesystemWeb!==0)errors.push(`unsafeFilesystemWeb=${unsafeFilesystemWeb}`);
if(parserChecks&&parserAccuracy<.985)errors.push(`parserAccuracy ${pct(parserAccuracy)} < 98.5%`);
if(errors.length){console.error("Refinement V2 gates failed:",errors.join(", "));process.exit(1);}

function singleTurnDomainRow(row){return !["multi-turn","multi-step","correction","ambiguity"].includes(row.category)&&row.expectedDomain!=="unknown";}
function domainCompatible(expected,actual){if(expected===actual)return true;return(expected==="web"&&actual==="browser")||(expected==="browser"&&actual==="web");}
function ratio(a,b){return b?a/b:1;}function pct(value){return `${(value*100).toFixed(2)}%`;}
function fail(message){console.error(message);process.exit(1);}
