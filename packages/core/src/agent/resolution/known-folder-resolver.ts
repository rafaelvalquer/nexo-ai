import path from "node:path";
import { resolveKnownFolderFromText } from "../../filesystem/known-folders.js";

export type ResolvedKnownFolder={id:"downloads"|"documents"|"desktop";path:string;confidence:number;matchedAlias:string;relativePath?:string};

export class KnownFolderResolver{
  resolve(value:string):ResolvedKnownFolder|undefined{
    const match=resolveKnownFolderFromText(value);
    if(!match||match.confidence<0.95)return undefined;
    const normalized=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const alias=match.matchedAlias.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const index=normalized.indexOf(alias);
    const suffix=index<0?"":value.slice(index+match.matchedAlias.length).replace(/^[\s\\/]+/,"").trim();
    if(!suffix)return match;
    const relative=path.normalize(suffix);
    if(path.isAbsolute(relative)||relative===".."||relative.startsWith(`..${path.sep}`))return match;
    return{...match,path:path.join(match.path,relative),relativePath:relative};
  }
}
