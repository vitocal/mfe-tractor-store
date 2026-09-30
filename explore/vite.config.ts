import { defineConfig } from "vite";

import preact from "@preact/preset-vite";
import history from "connect-history-api-fallback";

function historyFallbackPlugin(): Plugin {
  return {
    name: "history-fallback-plugin",
    configureServer(server) {
      server.middlewares.use(
        history({
          index: "/playground/index.html",
          htmlAcceptHeaders: ["text/html", "application/xhtml+xml"],
        }) as any
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    preact({ reactAliasesEnabled: true, prefreshEnabled: false }),
    historyFallbackPlugin(),
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
        'catalog': './catalog.ts'
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
