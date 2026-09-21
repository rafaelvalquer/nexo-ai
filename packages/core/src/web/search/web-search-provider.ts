import type {WebSearchResult} from "../types.js";
export interface WebSearchProvider{
  name:string;
  search(query:string,limit:number,signal?:AbortSignal):Promise<WebSearchResult[]>;
}
