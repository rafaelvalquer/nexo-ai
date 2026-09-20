import type { IntentAction } from "./types.js";

export type IntentEntityKey =
  | "name"
  | "file"
  | "folder"
  | "path"
  | "content"
  | "query"
  | "source"
  | "destination"
  | "newName";

export type IntentOperationContract = {
  intent: IntentAction;
  allowedEntities: readonly IntentEntityKey[];
  requiredEntities: readonly IntentEntityKey[];
  optionalEntities: readonly IntentEntityKey[];
};

export const intentOperationContracts: Record<string, IntentOperationContract> = {
  create_folder: {
    intent: "create",
    allowedEntities: ["name", "folder"],
    requiredEntities: ["name", "folder"],
    optionalEntities: []
  },
  create_text_file: {
    intent: "create",
    allowedEntities: ["name", "folder", "content"],
    requiredEntities: ["name", "folder"],
    optionalEntities: ["content"]
  },
  write_text_file: {
    intent: "update",
    allowedEntities: ["file", "folder", "path", "content"],
    requiredEntities: ["file", "content"],
    optionalEntities: ["folder", "path"]
  },
  find_file: {
    intent: "find",
    allowedEntities: ["name", "folder"],
    requiredEntities: ["name"],
    optionalEntities: ["folder"]
  },
  list_files: {
    intent: "list",
    allowedEntities: ["folder"],
    requiredEntities: ["folder"],
    optionalEntities: []
  },
  search_files: {
    intent: "find",
    allowedEntities: ["query", "folder"],
    requiredEntities: ["query"],
    optionalEntities: ["folder"]
  },
  read_file: {
    intent: "read",
    allowedEntities: ["path"],
    requiredEntities: ["path"],
    optionalEntities: []
  },
  file_info: {
    intent: "read",
    allowedEntities: ["path"],
    requiredEntities: ["path"],
    optionalEntities: []
  },
  copy_file: {
    intent: "update",
    allowedEntities: ["source", "destination"],
    requiredEntities: ["source", "destination"],
    optionalEntities: []
  },
  move_file: {
    intent: "update",
    allowedEntities: ["source", "destination"],
    requiredEntities: ["source", "destination"],
    optionalEntities: []
  },
  rename_file: {
    intent: "update",
    allowedEntities: ["path", "newName"],
    requiredEntities: ["path", "newName"],
    optionalEntities: []
  },
  trash_file: {
    intent: "delete",
    allowedEntities: ["path"],
    requiredEntities: ["path"],
    optionalEntities: []
  },
  unknown: {
    intent: "unknown",
    allowedEntities: [],
    requiredEntities: [],
    optionalEntities: []
  }
} as const;
