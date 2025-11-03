// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import { resolve } from "path";
// import fs from "fs";

// export default defineConfig({
//     root: "extension/devtools",
//     base: "./",

//     build: {
//         outDir: "../../dist/devtools",
//         emptyOutDir: false,
//         rollupOptions: {
//             input: {
//                 main: resolve(__dirname, "extension/devtools/index.html"),
//                 register: resolve(__dirname, "extension/devtools/register.ts"),
//             },
//             output: {
//                 entryFileNames: "[name].js",
//                 assetFileNames: "assets/[name]-[hash][extname]",
//             },
//         },
//     },

//     plugins: [
//         react(),
//         {
//             name: "copy-key",
//             closeBundle() {
//                 const src = resolve(__dirname, "key.pem");
//                 const dest = resolve(__dirname, "dist/key.pem");
//                 if (fs.existsSync(src)) {
//                     fs.copyFileSync(src, dest);
//                 }
//             },
//         },
//     ],
// });
// vite.config.devtools.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    // Set the root to the devtools source directory
    root: "extension/devtools",

    // Use relative paths for assets
    base: "./",

    build: {
        // Build *into* the correct subfolder of the main build's output dir
        outDir: resolve(__dirname, "dist/extension/devtools"),

        // CRITICAL: This MUST be true. 
        // It deletes the source files (copied by crx) before writing the compiled files.
        emptyOutDir: true,

        rollupOptions: {
            // Define BOTH of your HTML files as inputs for Vite
            input: {
                main: resolve(__dirname, "extension/devtools/index.html"),
                register: resolve(__dirname, "extension/devtools/register.html"),
            },

            // Keep the output filenames simple and predictable
            output: {
                entryFileNames: "[name].js",
                assetFileNames: "assets/[name]-[hash][extname]",
            },
        },
    },
    plugins: [react()],
});