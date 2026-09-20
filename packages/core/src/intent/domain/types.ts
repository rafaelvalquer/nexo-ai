export const intentDomains=["filesystem","web","email","calendar","documents","browser","system","memory","conversation","unknown"] as const;
export type ResolvedIntentDomain=typeof intentDomains[number];
export type DomainCandidate={domain:ResolvedIntentDomain;confidence:number;source:"deterministic"|"llm";evidence:string[]};
export type DomainResolution={status:"resolved";candidate:DomainCandidate}|{status:"unknown";candidates:DomainCandidate[];reason:string};
