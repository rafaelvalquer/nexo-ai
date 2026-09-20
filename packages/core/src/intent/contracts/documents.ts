import {contract} from "./types.js";
export const documentIntentContracts={document_read:contract("read",["path"]),document_summarize:contract("read",["path"]),document_create:contract("create",["name","content"],["folder","format"])} as const;
