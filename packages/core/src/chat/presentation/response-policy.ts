import type { AgentIntent } from "../../agent/orchestrator/intent-schema.js";

export type ResponseMode = "deterministic" | "synthesize" | "presentation";

const PRESENTATION_ONLY_TOOLS = new Set([
  "list_files",
  "search_files",
  "find_file",
  "largest_files",
  "email_search",
  "email_latest",
  "email_get_many",
  "calendar_list",
  "calendar_search"
]);

const DETERMINISTIC_READ_TOOLS = new Set(["memory_usage", "disk_usage", "system_info", "process_list", "macro_list"]);
const DETERMINISTIC_MUTATION_TOOLS = new Set(["create_text_file", "create_folder", "write_text_file"]);

export function responsePolicy(
  toolNames: string[],
  intent?: AgentIntent
): {
  mode: ResponseMode;
  appendText: boolean;
} {
  if(intent?.intent==="summarize")return{mode:"synthesize",appendText:true};
  if(toolNames.length>0&&toolNames.every(name=>DETERMINISTIC_READ_TOOLS.has(name)))return{mode:"deterministic",appendText:true};
  if(toolNames.length>0&&toolNames.every(name=>DETERMINISTIC_MUTATION_TOOLS.has(name)))return{mode:"deterministic",appendText:true};
  if (toolNames.length > 0 && toolNames.every(name => PRESENTATION_ONLY_TOOLS.has(name))) {
    return {
      mode: "presentation",
      appendText: false
    };
  }

  return {
    mode: "synthesize",
    appendText: true
  };
}
