import {contract} from "./types.js";
export const browserIntentContracts={navigate:contract("open",[],["url","domain","sourceName"]),browser_open:contract("open",["url"]),interact:contract("execute",["requestedAction"],["url","domain","sourceName"]),browser_agent_run:contract("execute",["requestedAction"],["url"])} as const;
