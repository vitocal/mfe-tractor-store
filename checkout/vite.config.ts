import { defineConfig } from "vite";

import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "./",
  plugins: [
    svelte({ compilerOptions: { customElement: true } }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true,
    // The SSG reads `.vite/manifest.json` to find the stylesheet each component needs.
    manifest: true,
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
        exports: "auto",
        // `catalog.js` and `routes.js` are fetched by url at runtime, so they keep their names.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
      treeshake: {
        moduleSideEffects: "no-external",
      },
    },
  },
  server: {
    port: 4003
  }
});
