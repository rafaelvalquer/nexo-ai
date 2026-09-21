import {contract} from "./types.js";
export const webIntentContracts={
 research:contract("web","find",["query"],["sourceName","domain"]),
 web_research:contract("web","find",["query"],["sourceName","domain"]),
 web_search:contract("web","find",["query"],["sourceName","domain"]),
 fetch:contract("web","read",["url"]),
 web_fetch:contract("web","read",["url"]),
 web_extract:contract("web","read",["url"],["instruction"])
} as const;
