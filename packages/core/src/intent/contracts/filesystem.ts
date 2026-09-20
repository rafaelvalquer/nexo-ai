import {contract} from "./types.js";
export const filesystemIntentContracts={
 create_folder:contract("filesystem","create",["name","folder"]),
 create_text_file:contract("filesystem","create",["name","folder"],["content"]),
 write_text_file:contract("filesystem","update",["file","content"],["folder","path"]),
 find_file:contract("filesystem","find",["name"],["folder"]),
 list_files:contract("filesystem","list",["folder"]),
 search_files:contract("filesystem","find",["query"],["folder"]),
 read_file:contract("filesystem","read",["path"],["file","folder"]),
 file_info:contract("filesystem","read",["path"],["file","folder"]),
 copy_file:contract("filesystem","update",["source","destination"]),
 move_file:contract("filesystem","update",["source","destination"]),
 rename_file:contract("filesystem","update",["path","newName"]),
 trash_file:contract("filesystem","delete",["path"])
} as const;
