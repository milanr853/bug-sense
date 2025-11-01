// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./extension/manifest.json";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "extension/popup/index.html"),
        devtools: resolve(__dirname, "extension/devtools/index.html"),
        uploader: resolve(__dirname, "extension/uploader.html"),
        background: resolve(__dirname, "extension/background/index.ts"),
        replayListener: resolve(__dirname, "extension/content/replayListener.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background")
            return "extension/background/[name].js";
          if (chunk.name === "replayListener")
            return "extension/content/[name].js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
  publicDir: "public",
});
