export type IntentFeatureFlags={
 inputNormalizerV3Enabled:boolean;
 candidateArbiterEnabled:boolean;
 candidateArbiterShadowMode:boolean;
 domainHardVetoEnabled:boolean;
 contextSnapshotV2Enabled:boolean;
 outcomeProgressVerifierEnabled:boolean;
 intentLearningV3Enabled:boolean;
 structuredClarificationEnabled:boolean;
 canonicalActionPlannerEnabled:boolean;
 semanticCandidateDedupEnabled:boolean;
 ordinalContextExecutionEnabled:boolean;
 webFilenameVetoEnabled:boolean;
};
export function intentFeatureFlags(env:NodeJS.ProcessEnv=process.env):IntentFeatureFlags{
 return{
  inputNormalizerV3Enabled:flag(env.NEXO_INPUT_NORMALIZER_V3,true),
  candidateArbiterEnabled:flag(env.NEXO_CANDIDATE_ARBITER,true),
  candidateArbiterShadowMode:flag(env.NEXO_CANDIDATE_ARBITER_SHADOW,false),
  domainHardVetoEnabled:flag(env.NEXO_DOMAIN_HARD_VETO,true),
  contextSnapshotV2Enabled:flag(env.NEXO_CONTEXT_SNAPSHOT_V2,true),
  outcomeProgressVerifierEnabled:flag(env.NEXO_OUTCOME_PROGRESS_VERIFIER,true),
  intentLearningV3Enabled:flag(env.NEXO_INTENT_LEARNING_V3,true),
  structuredClarificationEnabled:flag(env.NEXO_STRUCTURED_CLARIFICATION,true),
  canonicalActionPlannerEnabled:flag(env.NEXO_CANONICAL_ACTION_PLANNER,true),
  semanticCandidateDedupEnabled:flag(env.NEXO_SEMANTIC_CANDIDATE_DEDUP,true),
  ordinalContextExecutionEnabled:flag(env.NEXO_ORDINAL_CONTEXT_EXECUTION,true),
  webFilenameVetoEnabled:flag(env.NEXO_WEB_FILENAME_VETO,true)
 };
}
function flag(value:string|undefined,fallback:boolean){if(value===undefined)return fallback;return !/^(?:0|false|off|no)$/i.test(value.trim());}
