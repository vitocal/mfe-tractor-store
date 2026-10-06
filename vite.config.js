import { defineConfig } from "vite";

import spaFallback from "./src/spa-fallback.ts";
import stageTeamAssets from "./src/stage-team-assets.ts";

export default defineConfig({
  appType: "mpa",
  plugins: [
    spaFallback(),
    stageTeamAssets(),
  ],
  build: {
    outDir: "dist/",
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: true,
    // The SSG reads `.vite/manifest.json` to find the stylesheets a page's components need.
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
      },
    },
  },
});
