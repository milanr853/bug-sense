import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    plugins: [react()],

    build: {
        outDir: resolve(__dirname, "dist-build/extension/devtools"),
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(__dirname, "extension/devtools/index.html"),
            output: {
                entryFileNames: "devtools_panel.js",
                assetFileNames: "assets/[name]-[hash][extname]",
            },
        },
    },

    // 👇 Important fix
    root: resolve(__dirname, "extension/devtools"),

    // 👇 Prevent Vite from copying TSX sources
    publicDir: false,
    resolve: {
        alias: {
            "@": resolve(__dirname, "extension/devtools"),
        },
    },
});
