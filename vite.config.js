import { defineConfig } from "vite";

import preloadCatalogs from "./scripts/preload-catalogs.ts";
import stageTeamAssets from "./scripts/stage-team-assets.ts";
import { TEAMS } from "./scripts/ssg-teams.ts";
import ssg from "./scripts/ssg.ts";

// Which site a build produces. Vite's `appType` is the switch: `spa` is the shell the browser
// renders, `custom` means the build answers its own html and the prerender pass runs. `npm run
// build` is the former; `npm run build:ssg` sets `APP_TYPE=ssr` for the latter.
const appType = process.env.APP_TYPE === "ssr" ? "custom" : "spa";

// The teams' published builds, as the urls the shell fetches them from at runtime - the same urls
// the SSG's render reads (`scripts/ssg.ts`). They come from the one table of teams there is
// (`scripts/ssg-teams.ts`), so a team added there is a team the shell loads and the pass writes
// pages for. The shell's own code can not import that table, because it reads the filesystem, so
// the values are handed to it here - the way `SPA_ROUTER` is below.
const teamCatalogs = TEAMS.map((team) => `/${team.name}/dist/catalog.js`);
const teamRoutes = TEAMS.map((team) => `/${team.name}/dist/routes.js`);

// Whether the pages ask the browser for the teams' catalogs up front, in the same round trip as
// the shell's own script. See `scripts/preload-catalogs.ts`; off by default, as it only moves
// fetches around and the pages are correct either way.
const preloadMitigation = process.env.PRELOAD_MITIGATION === "1";

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
    // The teams, as urls. `src/catalog.ts` and `src/routes.ts` fetch these instead of importing the
    // teams' packages, which is what keeps a team's build out of the shell's bundle - see there.
    "import.meta.env.TEAM_CATALOGS": JSON.stringify(teamCatalogs),
    "import.meta.env.TEAM_ROUTES": JSON.stringify(teamRoutes),
  },
  plugins: [stageTeamAssets(), preloadCatalogs({ catalogs: teamCatalogs, enabled: preloadMitigation }), ssg()],
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
      },
    },
  },
});
