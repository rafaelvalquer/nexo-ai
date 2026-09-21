import {contract} from "./types.js";
export const browserIntentContracts={
 navigate:contract("browser","open",[],["url","domain","sourceName"]),
 browser_open:contract("browser","open",["url"]),
 browser_navigate:contract("browser","open",["url"]),
 interact:contract("browser","execute",["requestedAction"],["url","domain","sourceName"]),
 browser_agent_run:contract("browser","execute",["requestedAction"],["url"])
} as const;
