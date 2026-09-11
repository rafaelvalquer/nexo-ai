import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { defaultDataDir } from "./paths.js";

export function createLogger(dataDir=defaultDataDir()) {
  const logDir=path.join(dataDir,"logs");
  fs.mkdirSync(logDir,{recursive:true});
  const file=path.join(logDir,"nexo.log");
  return pino({level:process.env.NEXO_LOG_LEVEL ?? "info"},pino.destination({dest:file,sync:false}));
}
