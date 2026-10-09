import { defineConfig } from "vite";

import cacheHeaders from "./scripts/cache-headers.ts";
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
// the shell's own script. See `scripts/preload-catalogs.ts`.
//
// On by default. The pages are correct either way - this only moves fetches around - but the
// fetches are not: the shell discovers its teams at runtime, so without this the catalogs, and
// every component behind them, are two round trips behind the shell's own script. Those round
// trips are the whole of what a navigation costs on a prerendered page, whose markup was already
// complete. `PRELOAD_MITIGATION=0` turns it off, which is what a comparison run wants.
const preloadMitigation = process.env.PRELOAD_MITIGATION !== "0";

// How long a browser may keep what it fetches. See `scripts/cache-headers.ts`, which turns this
// into a `_headers` file for Cloudflare Pages and into the same headers on `vite preview`.

/** The name is a content hash, so it changes with the content: a year is safe. */
const YEAR = "public, max-age=31536000, immutable";

/** A release pointer, or an asset that keeps its name: an hour, then ask again. */
const HOUR = "public, max-age=3600";

/**
 * What a request is served with, by path. First match wins; a path that is neither listed here nor a
 * page keeps Cloudflare Pages' own default.
 */
export const CACHE = {
  /** A page is the markup of a release, so it is never used without revalidating. */
  page: "no-cache, must-revalidate, stale-while-revalidate",

  rules: [
    // Fingerprinted by the build, so the name changes when the content does.
    { path: "/assets/*", cache: YEAR },
    { path: "/chunks/*", cache: YEAR },
    { path: "/entries/*", cache: YEAR },

    // Each team's build, at the paths the shell fetches it from. The hour is what lets a team
    // release without the shell being rebuilt - and it is only safe while the previous release's
    // fingerprinted files are still served, because a catalog names the stylesheets *it* compiled.
    ...TEAMS.flatMap(({ name }) => [
      { path: `/${name}/dist/assets/*`, cache: YEAR },
      { path: `/${name}/dist/chunks/*`, cache: YEAR },
      { path: `/${name}/dist/catalog.js`, cache: HOUR },
      { path: `/${name}/dist/routes.js`, cache: HOUR },
    ]),

    // Names that stay put.
    { path: "/catalog.js", cache: HOUR },
    { path: "/cdn/*", cache: HOUR },
    { path: "/robots.txt", cache: HOUR },
    { path: "/llms.txt", cache: HOUR },
  ],
};

export default defineConfig({
  appType,
  define: {
    "import.meta.env.SPA_ROUTER": JSON.stringify(
      appType === "custom" ? "" : '<script type="module" src="/src/router-app.ts" blocking="render"></script>',
    ),
    // The teams catalogs as urls
    "import.meta.env.TEAM_CATALOGS": JSON.stringify(teamCatalogs),
    "import.meta.env.TEAM_ROUTES": JSON.stringify(teamRoutes),
  },
  plugins: [
    stageTeamAssets(),
    preloadCatalogs({ catalogs: teamCatalogs, enabled: preloadMitigation }),
    ssg(),
    cacheHeaders(CACHE),
  ],
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
      },
      // Ensure entry point exports are treated as public module exports
      preserveEntrySignatures: "exports-only",

      output: {
        format: "esm",
        exports: "auto",
        // `catalog` is the shell's published catalog - a release pointer, so it keeps its name.
        entryFileNames: (chunk) => (chunk.name === "catalog" ? "[name].js" : "entries/[name]-[hash].js"),
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
