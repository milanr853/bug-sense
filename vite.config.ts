// vite.config.ts
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

    // 🔑 Plugin: Copy key.pem to dist/ after build
    {
      name: "copy-key-pem",
      closeBundle() {
        const src = resolve(__dirname, "key.pem");
        const dest = resolve(__dirname, "dist-build/key.pem"); // ✅ fixed path

        if (!fs.existsSync(src)) {
          console.warn("⚠️ key.pem not found — skipping copy (safe to ignore for dev builds).");
          return;
        }

        try {
          fs.copyFileSync(src, dest);
          console.log("✅ key.pem copied to dist-build/");
        } catch (err) {
          console.error("❌ Failed to copy key.pem:", err);
        }
      },
    },

  ],

  build: {
    outDir: "dist-build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "extension/popup/index.html"),
        uploader: resolve(__dirname, "extension/uploader.html"),
        background: resolve(__dirname, "extension/background/index.ts"),
        replayListener: resolve(__dirname, "extension/content/replayListener.ts"),
        duplicateBugDetector: resolve(__dirname, "extension/content/duplicateBugDetector.ts"),
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

  publicDir: "public",
});
