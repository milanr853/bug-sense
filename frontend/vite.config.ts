// vite.config.ts (replace file with this)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./extension/manifest.json";
import { resolve } from "path";
import fs from "fs";

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),

    // copy key.pem -> dist if present
    {
      name: "copy-key-pem",
      closeBundle() {
        const src = resolve(__dirname, "key.pem");
        const dest = resolve(__dirname, "dist/key.pem");
        if (!fs.existsSync(src)) {
          console.warn("⚠️ key.pem not found — skipping (dev).");
          return;
        }
        try {
          fs.copyFileSync(src, dest);
          console.log("✅ key.pem copied to dist/");
        } catch (err) {
          console.error("❌ Failed to copy key.pem:", err);
        }
      },
    },
  ],

  // IMPORTANT: disable publicDir to prevent accidental copies
  publicDir: false,

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "extension/popup/index.html"),
        uploader: resolve(__dirname, "extension/uploader/uploader.html"),
        background: resolve(__dirname, "extension/background/index.ts"),
        replayListener: resolve(__dirname, "extension/content/replayListener.ts"),
        duplicateBugDetector: resolve(__dirname, "extension/content/duplicateBugDetector.ts"),
        consoleListener: resolve(__dirname, "extension/content/consoleListener.ts"),
        recorder: resolve(__dirname, "extension/recorder/recorder.html"),
        // NOTE: Do NOT add devtools HTML here — devtools build is separate
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "extension/background/[name].js";
          if (chunk.name === "replayListener") return "extension/content/[name].js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
