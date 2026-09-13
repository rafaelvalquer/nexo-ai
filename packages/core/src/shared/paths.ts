import os from "node:os";
import path from "node:path";

export function defaultDataDir() {
  if(process.env.NEXO_DATA_DIR)return path.resolve(process.env.NEXO_DATA_DIR);
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "NexoAI");
  }
  return path.join(os.homedir(), ".nexo-ai");
}

export function defaultAllowedRoots() {
  return [
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Desktop")
  ];
}
