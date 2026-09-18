import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import desktopPackage from "./package.json" with { type: "json" };

const __dirname=path.dirname(fileURLToPath(import.meta.url));
let commit=process.env.NEXO_BUILD_COMMIT;
if(!commit){try{commit=execFileSync("git",["rev-parse","--short","HEAD"],{cwd:path.resolve(__dirname,"../.."),encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{commit="unknown";}}
const localDate=new Date();
const buildDate=process.env.NEXO_BUILD_DATE??`${localDate.getFullYear()}-${String(localDate.getMonth()+1).padStart(2,"0")}-${String(localDate.getDate()).padStart(2,"0")}`;
const buildInfo={version:desktopPackage.version,commit,buildDate};

export default defineConfig({
  root: "renderer",
  base: "./",
  plugins:[react()],
  define:{__NEXO_BUILD_INFO__:JSON.stringify(buildInfo)},
  build:{outDir:"../dist",emptyOutDir:true,manifest:"renderer-manifest.json"},
  resolve:{dedupe:["pixi.js"],alias:{"@":path.resolve(__dirname,"renderer")}}
});
