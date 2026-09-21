export type ToolInputNormalization={input:Record<string,unknown>;clampedFields:string[]};

const LIMITS:Record<string,Record<string,{min:number;max:number}>>={
  find_file:{maxResults:{min:1,max:50}},
  web_search:{maxResults:{min:1,max:10}},
  web_research:{maxSources:{min:1,max:5}},
  list_files:{limit:{min:1,max:100}},
  largest_files:{limit:{min:1,max:50}}
};

export function normalizeToolInput(toolName:string,raw:Record<string,unknown>):ToolInputNormalization{
  const input={...raw},clampedFields:string[]=[];
  const limits=LIMITS[toolName];
  if(!limits)return{input,clampedFields};
  for(const [field,bounds] of Object.entries(limits)){
    const value=input[field];
    if(typeof value!=="number"||!Number.isFinite(value))continue;
    const normalized=Math.min(bounds.max,Math.max(bounds.min,Math.round(value)));
    if(normalized!==value){input[field]=normalized;clampedFields.push(field);}
  }
  return{input,clampedFields};
}
