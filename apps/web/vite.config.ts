import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@origin-studio/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@origin-studio/profiles": path.resolve(__dirname, "../../packages/profiles/src/index.ts"),
      "@origin-studio/project-indexer": path.resolve(__dirname, "../../packages/project-indexer/src/index.ts"),
      "@origin-studio/validator": path.resolve(__dirname, "../../packages/validator/src/index.ts")
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
