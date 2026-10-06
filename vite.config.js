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
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
      },
    },
  },
});
