import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const fail=message=>{console.error("[action-planning-boundary]",message);process.exitCode=1;};

const mapper=read("packages/core/src/intent/intent-tool-mapper.ts");
const planBuilder=read("packages/core/src/agent/orchestrator/plan-builder.ts");
const command=read("packages/core/src/application/command-service.ts");
const canonical=read("packages/core/src/agent/action-planning/canonical-action-planner.ts");

for(const pattern of [
  /if\s*\(\s*intent\.operation\s*===\s*["']write_text_file["']/,
  /if\s*\(\s*intent\.operation\s*===\s*["']open_file["']/,
  /switch\s*\(\s*intent\.operation\s*\)/,
  /deferredAction\s*:\s*\{\s*kind\s*:\s*["']filesystem\.write_text["']/
])if(pattern.test(mapper))fail("IntentToolMapper voltou a construir workflow executável por operação.");

if(!/\/\*\*\s*\n\s*\* @deprecated Compatibility wrapper\./.test(planBuilder))fail("buildIntentPlan deve permanecer explicitamente deprecated.");
if(!/new CanonicalActionPlanner\(availability\)\.planDecision/.test(planBuilder))fail("buildIntentPlan deve delegar ao CanonicalActionPlanner.");
if(/function sameDecision\s*\(/.test(command))fail("CommandService não pode reconciliar candidatos por igualdade rígida de JSON.");
if(!/type CandidateEnvelope=\{[\s\S]*routeSeed:CanonicalIntentDecision/.test(command))fail("CommandService deve carregar CandidateEnvelope com CanonicalIntentDecision.");
if(!/routeCanonicalDecision\(/.test(command))fail("CommandService deve materializar a decisão selecionada via CanonicalActionPlanner.");
if(!/private routeExact[\s\S]*Compatibility/.test(command)&&!/Compatibility route retained/.test(command))fail("Rollback legado precisa estar explicitamente marcado.");
for(const domain of ["Filesystem","Web","Browser","Email","Calendar","Document","System"]){
  if(!new RegExp(`new ${domain}ActionPlanner\\(`).test(canonical))fail(`CanonicalActionPlanner não registra ${domain}ActionPlanner.`);
}
if(process.exitCode)process.exit(process.exitCode);
console.log("Action planning boundaries: OK");
