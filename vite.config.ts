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
      },
    },
  },
  publicDir: "public", // ensure vite knows where static assets are
});
