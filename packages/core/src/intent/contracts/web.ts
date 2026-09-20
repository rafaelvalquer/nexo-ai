import {contract} from "./types.js";
export const webIntentContracts={research:contract("find",["query"],["sourceName","domain"]),web_research:contract("find",["query"],["sourceName","domain"]),fetch:contract("read",["url"]),web_fetch:contract("read",["url"])} as const;
