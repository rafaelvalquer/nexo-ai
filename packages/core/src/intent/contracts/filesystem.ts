import {contract} from "./types.js";
export const filesystemIntentContracts={
 create_folder:contract("create",["name","folder"]),create_text_file:contract("create",["name","folder"],["content"]),write_text_file:contract("update",["file","content"],["folder","path"]),
 find_file:contract("find",["name"],["folder"]),list_files:contract("list",["folder"]),search_files:contract("find",["query"],["folder"]),read_file:contract("read",["path"]),file_info:contract("read",["path"]),
 copy_file:contract("update",["source","destination"]),move_file:contract("update",["source","destination"]),rename_file:contract("update",["path","newName"]),trash_file:contract("delete",["path"])
} as const;
