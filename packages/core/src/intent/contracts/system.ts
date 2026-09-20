import {contract} from "./types.js";
export const systemIntentContracts={process_list:contract("list"),system_info:contract("read"),memory_usage:contract("read"),disk_usage:contract("read")} as const;
