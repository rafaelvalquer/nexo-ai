import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "renderer",
  base: "./",
  plugins:[react()],
  build:{outDir:"../dist",emptyOutDir:true},
  resolve:{dedupe:["pixi.js"],alias:{"@":path.resolve(__dirname,"renderer")}}
});
