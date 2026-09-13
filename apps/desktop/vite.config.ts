import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "renderer",
  base: "./",
  plugins:[react()],
  build:{outDir:"../dist",emptyOutDir:true,rollupOptions:{output:{manualChunks(id){if(id.includes("node_modules/pixi.js")||id.includes("node_modules/@pixi"))return"pixi";if(id.includes("node_modules/three")||id.includes("node_modules/@react-three"))return"three";if(id.includes("node_modules/@xyflow"))return"xyflow";if(id.includes("node_modules/docx-preview"))return"document-preview";}}}},
  resolve:{alias:{"@":path.resolve(__dirname,"renderer")}}
});
