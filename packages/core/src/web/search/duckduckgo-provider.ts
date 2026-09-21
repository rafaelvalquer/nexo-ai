import type {WebSearchProvider} from "./web-search-provider.js";
import type {WebSearchResult} from "../types.js";
import {WebReaderService} from "../reader-service.js";

export class DuckDuckGoProvider implements WebSearchProvider{
  readonly name="duckduckgo";
  constructor(private readonly reader:WebReaderService){}
  async search(query:string,limit:number,signal?:AbortSignal):Promise<WebSearchResult[]>{
    return (await this.reader.search(query,limit,signal)).results;
  }
}
