import {contract} from "./types.js";
export const systemIntentContracts={
 process_list:contract("system","list"),
 system_info:contract("system","read"),
 memory_usage:contract("system","read"),
 disk_usage:contract("system","read")
} as const;
