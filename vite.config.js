import { defineConfig } from "vite";

import stageTeamAssets from "./scripts/stage-team-assets.ts";
import ssg from "./scripts/ssg.ts";

// Which site a build produces. Vite's `appType` is the switch: `spa` is the shell the browser
// renders, `custom` means the build answers its own html and the prerender pass runs. `npm run
// build` is the former; `npm run build:ssg` sets `APP_TYPE=ssr` for the latter.
const appType = process.env.APP_TYPE === "ssr" ? "custom" : "spa";

export default defineConfig({
  appType,
  // The full router is a script of its own, present in the SPA build only. `index.html` carries
  // a `%SPA_ROUTER%` placeholder, which Vite's html env hook fills from this define (keys under
  // `import.meta.env.` are exposed to `%NAME%` in html). An SSR build replaces it with nothing,
  // so neither the page nor the SSR bundle carries the router.
  define: {
    "import.meta.env.SPA_ROUTER": JSON.stringify(
      appType === "custom" ? "" : '<script type="module" src="/src/router-app.ts" blocking="render"></script>',
    ),
  },
  plugins: [stageTeamAssets(), ssg()],
  build: {
    outDir: "dist/",
    sourcemap: true,
    emptyOutDir: true,
    modulePreload: {
      polyfill: false,
    },
    cssCodeSplit: true,
    // The SSG reads `.vite/manifest.json` to find the stylesheets a page's components need.
    manifest: true,
    rollupOptions: {
      output: {
        keepNames: true,
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
      },
    },
  },
});
