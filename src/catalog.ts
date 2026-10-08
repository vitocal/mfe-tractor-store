import type { Catalog } from "ce-autoloader";

import ds from "./components/catalog";

/**
 * The shell's own custom elements, alongside the teams' and the design system's.
 *
 * The ribbon that reports how the page on screen was rendered - see `./components/ribbon.ts`.
 * `index.html` carries `<render-mode>` on every page, and this is the loader `ce-autoloader`
 * upgrades it with. The key has to be the tag the element registers itself under (`RIBBON_TAG`
 * in `./components/ribbon.ts`).
 */
const shell: Catalog = {
    "render-mode": () => import("./components/ribbon"),
};

/** An element that is not ours: its loader is the url it lives at, not a build of this repo */
const vendors: Catalog = {
    "json-viewer": "https://esm.sh/@alenaksu/json-viewer?standalone"
}

/**
 * The urls the teams publish their catalogs at, handed in by the build.
 *
 * `scripts/ssg-teams.ts` is the one table of teams there is, but it reads the filesystem, so the
 * shell can not import it. `vite.config.js` reads it and passes the urls through `define` - see
 * there, and `globals.d.ts` for the type.
 */
const TEAM_CATALOGS = import.meta.env.TEAM_CATALOGS;

/**
 * A team's catalog, fetched from the build the team published.
 *
 * The import is a url rather than a specifier on purpose: what the shell loads is the file the
 * team's build wrote, sitting next to the chunks it preloads. Bundling it instead would inline one
 * build into another, and the preload map a team's catalog carries is written in paths relative to
 * *its own* url - which the shell's output has no reason to reproduce. See `README.md`.
 *
 * `@vite-ignore` is what keeps the bundler out of it: a url it can see, it would bundle.
 */
async function teamCatalog(url: string): Promise<Catalog> {
    const module = (await import(/* @vite-ignore */ url)) as { catalog?: Catalog; default?: Catalog };

    return module.catalog ?? module.default ?? {};
}

/**
 * The shell's catalog: its own elements, the design system's, and every team's.
 *
 * Asynchronous, because the teams are fetched. It has to be awaited *before* the loader is built
 * (`./app.ts`): `ce-autoloader` resolves a tag once, and a tag whose loader is not in the catalog
 * yet is left untouched rather than retried - which, on a prerendered page, is every element the
 * page already holds.
 */
export async function catalog(): Promise<Catalog> {
    const teams = await Promise.all(TEAM_CATALOGS.map(teamCatalog));

    return Object.assign({}, shell, ds, ...teams, vendors);
}

export default catalog;