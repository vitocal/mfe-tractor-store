import { defineConfig } from "vite";

import preact from "@preact/preset-vite";

export default defineConfig({
  base: "./",
  plugins: [preact({ reactAliasesEnabled: true, prefreshEnabled: false })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: {
      polyfill: false
    },
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        'catalog': './catalog.ts'
      },
      // Ensure entry point exports are treated as public module exports
      preserveEntrySignatures: "allow-extension",

      output: {
        format: "esm",
        keepNames: true,
        exports: "auto",
        // preserveModules: true,
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",

      },
      treeshake: {
        moduleSideEffects: "no-external",
      },
    },
  },
});
