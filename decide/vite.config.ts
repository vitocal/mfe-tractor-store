import { defineConfig } from "vite";

import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "./",
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.includes("-"),
        },
      },
    }),
  ],
  build: {
    outDir: "dist",
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
