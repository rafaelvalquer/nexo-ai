export type WebIntentOperation="navigate"|"search"|"fetch"|"research"|"interact"|"unknown";
export type CanonicalWebIntent={
  schemaVersion:1;
  domain:"web";
  operation:WebIntentOperation;
  entities:{sourceName?:string;searchProvider?:"default"|"google";domain?:string;url?:string;query?:string;topic?:string;requestedAction?:string};
  requiresInformation:boolean;
  requiresInteraction:boolean;
  confidence:number;
  ambiguities:string[];
  missing:string[];
};
export type WebIntentResolution={status:"resolved";intent:CanonicalWebIntent}|{status:"unknown";reason?:string};
