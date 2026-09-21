import {contract} from "./types.js";
export const documentIntentContracts={
 document_get:contract("documents","read",["path"]),
 document_read:contract("documents","read",["path"]),
 document_summarize:contract("documents","read",["path"],["instruction"]),
 document_extract:contract("documents","read",["path"],["instruction"]),
 document_compare:contract("documents","read",["paths"],["instruction"]),
 document_create:contract("documents","create",["name","content"],["folder","format"])
} as const;
