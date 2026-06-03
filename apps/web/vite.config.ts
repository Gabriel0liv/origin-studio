import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": {
        target: "ws://127.0.0.1:8787",
        ws: true
      }
    }
  }
});
