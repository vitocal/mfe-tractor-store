import { defineConfig } from "vite";

import stageTeamAssets from "./scripts/stage-team-assets.ts";
import ssg from "./scripts/ssg.ts";

// Which site a build produces. Vite's `appType` is the switch: `spa` is the shell the browser
// renders, `custom` means the build answers its own html and the prerender pass runs. `npm run
// build` is the former; `npm run build:ssg` sets `APP_TYPE=ssr` for the latter.
const appType = process.env.APP_TYPE === "ssr" ? "custom" : "spa";

export default defineConfig({
  appType,
  plugins: [stageTeamAssets(), ssg()],
  build: {
    outDir: "dist/",
    emptyOutDir: true,
    modulePreload: {
      polyfill: false,
    },
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
