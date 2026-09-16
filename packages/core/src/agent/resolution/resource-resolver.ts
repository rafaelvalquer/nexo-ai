import path from "node:path";

export type ResolvedResource={kind:"document"|"path";documentId?:string;path?:string;requiresImport:boolean};
export class ResourceResolver{
  resolve(input:{documentId?:unknown;path?:unknown}):ResolvedResource|undefined{
    if(typeof input.documentId==="string"&&input.documentId.trim())return{kind:"document",documentId:input.documentId.trim(),requiresImport:false};
    if(typeof input.path==="string"&&path.isAbsolute(input.path.trim()))return{kind:"path",path:path.normalize(input.path.trim()),requiresImport:true};
    return undefined;
  }
  bridgeInput(input:Record<string,unknown>,documentId:string){const next:Record<string,unknown>={...input,documentId};delete next.path;return next;}
}
