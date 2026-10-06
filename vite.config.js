import { defineConfig } from "vite";

import spaFallback from "./src/spa-fallback.ts";

export default defineConfig({
  appType: "mpa",
  plugins: [
    spaFallback(),
  ],
  build: {
    outDir: "dist/",
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
      },
    },
  },
});
