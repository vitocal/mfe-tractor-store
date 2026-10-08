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
  // plugins: [stageTeamAssets(), ssg()],
  plugins: [ssg()],
  build: {
    outDir: "dist/",
    sourcemap: true,
    emptyOutDir: true,
    manifest: true,
    modulePreload: {
      polyfill: false,
    },
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        index: "./index.html",
        catalog: "./src/catalog.ts",
      },
      // Ensure entry point exports are treated as public module exports
      preserveEntrySignatures: "exports-only",

      output: {
        format: "esm",
        exports: "auto",

        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        // entryFileNames: "[name].js",

        // The catalogs' own preload maps hold paths relative to the shell's root (they are read
        // against the url of the module that carries them), so the chunk holding them sits beside
        // `index.js` rather than under `chunks/`.
        // chunkFileNames: (chunk) => (chunk.name === "team-catalogs" ? "[name].js" : "chunks/[name].js"),
        // The teams' catalogs are pre-built: their own build already rendered every preload marker
        // they contain. A chunk of their own asks Vite for no preloads at all, and Vite prepends its
        // helper only to a chunk that asks for some - so the map a catalog carries is left alone,
        // and the name it uses never meets the shell's copy of it.
        // codeSplitting: {
        //   groups: [{ name: "team-catalogs", test: /[\\/]dist[\\/]catalog\.js$/ }],
        // },
      },
    },
  },
});
