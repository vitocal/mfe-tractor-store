import { defineConfig } from "vite";

import preact from "@preact/preset-vite";
import playgroundFallback from "./playground/server.ts";

export default defineConfig({
  base: "./",
  plugins: [
    preact({ reactAliasesEnabled: true, prefreshEnabled: false }),
    playgroundFallback(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: {
      polyfill: false
    },
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        'catalog': './catalog.ts',
        'routes': './routes.ts'
      },
      // Ensure entry point exports are treated as public module exports
      preserveEntrySignatures: "allow-extension",

      output: {
        format: "esm",
        keepNames: true,
        exports: "auto",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
      },
      treeshake: {
        moduleSideEffects: "no-external",
      },
    },
  },
  server: {
    port: 4001
  }
});
