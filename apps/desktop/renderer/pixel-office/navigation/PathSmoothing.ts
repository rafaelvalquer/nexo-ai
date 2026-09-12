import type { GridPoint } from "./Grid";
export function smoothPath(path:GridPoint[]){if(path.length<3)return path;const result=[path[0]];for(let i=1;i<path.length-1;i++){const a=result.at(-1)!,b=path[i],c=path[i+1];if((b.x-a.x)*(c.y-b.y)!==(b.y-a.y)*(c.x-b.x))result.push(b);}result.push(path.at(-1)!);return result;}
