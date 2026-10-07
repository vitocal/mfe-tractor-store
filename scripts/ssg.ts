/**
 * Static site generation, as a Vite plugin.
 *
 * Renders each team's routes into real html files where the page components are already
 * expanded, so crawlers - and the first paint - get the full markup instead of an empty stage:
 *
 *     <vi-router></vi-router>
 *         ->  <vi-router><explore-pages-home><main>…</main></explore-pages-home></vi-router>
 *
 * The expansion is the render a server would answer with: the built shell is read, each route's
 * markup is put inside `<vi-router>`, and the *built* team components - the very chunks the
 * browser loads - are run through Happy DOM and serialized. There is no browser and no hand
 * written template, so the files can not drift from the app.
 *
 * It runs as a Vite plugin, in `closeBundle`, so a single `vite build` writes the pages. Which
 * site that build produces comes from Vite's `appType`: `custom` means the build answers its own
 * html and this pass runs, `spa` means the browser renders every route and it does not - see
 * `vite.config.js`. `npm run build` is the SPA, `npm run build:ssg` is the prerendered site.
 *
 * The render itself is the project's own dog food: `ceRenderPages` (the batch form of
 * `ceRenderToString`) expands the tags, and `component-styles.ts` links the stylesheets a page
 * needs. All this pass decides is *which* pages to write and *where*.
 */

import FS from "node:fs/promises";
import Path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Plugin, ResolvedConfig } from "vite";

import { createRouter } from "../src/router.ts";
import type { Route } from "../src/router.ts";
import { tagsIn } from "../src/tags.ts";
import { markPrerendered, withRoute, withoutRoute } from "./prerendered.ts";
import { CE_ORIGIN, ceRenderPages } from "./ce-render.ts";
import {
  designSystemBuild,
  stylesByTag,
  stylesForTags,
  teamBuild,
  unknownTags,
  withStylesheets,
  withoutStylesheets,
} from "./component-styles.ts";
import type { ComponentBuild, Manifest } from "./component-styles.ts";
import { TEAMS } from "./ssg-teams.ts";
import type { Team } from "./ssg-teams.ts";

/* ------------------------------------------------------------------- paths -- */

const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the shell build writes, and where the pages are written next to it */
const OUTPUT_DIR = Path.join(ROOT_DIR, "dist");

/** Directories the render may read assets from, tried in order */
const STATIC_ROOTS = [ROOT_DIR, Path.join(ROOT_DIR, "public"), OUTPUT_DIR];

/** The directory a team's build wrote, where its manifest and route table live */
function teamDist(team: Team): string {
  return Path.join(ROOT_DIR, team.name, "dist");
}

/* -------------------------------------------------------------- route table -- */

/**
 * Every concrete path a route pattern expands to, eg `/products/:category` ->
 * `/products/classic`. A pattern without params stays a single path.
 *
 * A pattern whose param has no known values expands to nothing: there is no page to write, and
 * writing one named after the placeholder would be worse than skipping it.
 */
export function pathsFor(route: Route, params: Record<string, string[]> = {}): string[] {
  const names = [...route.path.matchAll(/:([A-Za-z_$][\w$]*)/g)].map(([, name]) => name);

  return names.reduce<string[]>(
    (paths, name) =>
      paths.flatMap((path) =>
        (params[name] ?? []).map((value) => path.replace(`:${name}`, value)),
      ),
    [route.path],
  );
}

/**
 * `/products/classic` -> `products/classic.html`, `/` -> `index.html`.
 *
 * A route becomes one html file named after it, rather than a `products/classic/index.html`
 * directory index. That is the shape Vite's own preview fallback already serves for a url that
 * does not end in `/` (`try_files $uri $uri.html /index.html`), which is why preview needs no
 * plugin of its own.
 */
export function outputFileFor(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}.html` : "index.html";
}

/* ------------------------------------------------------------------ template -- */

/**
 * The shell omits `<head>` and lets the browser infer it. Be explicit, otherwise the parser
 * puts everything that follows into `<body>` and the serialized page loses its head.
 */
export function withExplicitHead(template: string): string {
  return /<head[\s>]/i.test(template)
    ? template
    : template.replace(/(<html[^>]*>)/i, "$1\n<head>");
}

/** Puts the route markup inside the shell stage, replacing whatever is there */
export function fillStage(template: string, html: string): string {
  return template.replace(/(<vi-router[^>]*>)[\s\S]*?(<\/vi-router>)/, `$1${html}$2`);
}

/* --------------------------------------------------------------- build data -- */

/** The manifest a build wrote: every module it emitted, with the stylesheet it needs */
async function readManifest(distDir: string, build: string): Promise<Manifest> {
  const file = Path.join(distDir, ".vite", "manifest.json");

  try {
    return JSON.parse(await FS.readFile(file, "utf8"));
  } catch {
    throw new Error(
      `The ${build} build manifest is missing (${Path.relative(ROOT_DIR, file)}). ` +
        `Run "npm run build --workspaces" first.`,
    );
  }
}

/**
 * Which stylesheet each component of every build needs.
 *
 * The shell's build contributes styles but no components to load. Its design system compiles
 * into chunks that import the shell entry (`chunks/button.js` starts with
 * `import … from "../index.js"`), and the entry is exactly what the render must not run - so a
 * `<ds-button>` keeps its placeholder in the prerendered markup and the browser fills it in.
 * Its stylesheet is linked all the same, so that placeholder is styled while it waits.
 */
async function readStyleIndex(shellDir: string): Promise<Map<string, string[]>> {
  const builds: ComponentBuild[] = [designSystemBuild(await readManifest(shellDir, "shell"))];

  for (const team of TEAMS) {
    const manifest = await readManifest(teamDist(team), team.name);

    builds.push(teamBuild(team.name, team.extension, manifest));
  }

  return stylesByTag(builds);
}

/**
 * The built code the render is allowed to run: each team's chunks and its catalog. Everything
 * else under the shell's javascript - the shell's own runtime above all - is served empty, so
 * it can not boot the router and re-render the stage being expanded.
 */
function codeUrls(teams: readonly Team[]): string[] {
  return teams.flatMap((team) => [
    `/${team.name}/dist/chunks/`,
    `/${team.name}/dist/catalog.js`,
  ]);
}

/** The built shell, the page every route starts from */
export async function readShell(shellDir: string = OUTPUT_DIR): Promise<string> {
  const file = Path.join(shellDir, "index.html");

  try {
    // The pass writes the root page over the shell html, so a narrowed run reads a page back
    // instead of the shell. Drop the blocks a previous run added, or every page would inherit
    // the root page's stylesheets and route on top of its own.
    const shell = withoutRoute(withoutStylesheets(await FS.readFile(file, "utf8")));

    return withExplicitHead(shell);
  } catch {
    throw new Error(
      `The built shell is missing (${Path.relative(ROOT_DIR, file)}). Run "npm run build" first.`,
    );
  }
}

/** The built route table of a team */
export async function readRoutes(team: Team): Promise<Route[]> {
  const file = Path.join(teamDist(team), "routes.js");

  try {
    const module = (await import(pathToFileURL(file).href)) as { default: Route[] };

    return module.default;
  } catch {
    throw new Error(
      `The ${team.name} routes are missing (${Path.relative(ROOT_DIR, file)}). ` +
        `Run "npm run build -w ${team.name}" first.`,
    );
  }
}

/* ---------------------------------------------------------------------- api -- */

export interface SsgPage {
  /** The team the page belongs to, eg `explore` */
  team: string;
  /** The route path that was rendered, eg `/products/classic` */
  path: string;
  /** The url the page was rendered for */
  url: string;
  /** Absolute path of the written file */
  outputFile: string;
  /** Stylesheets linked into the page, in the order they were written */
  styles: string[];
  /** Size of the written file in bytes */
  bytes: number;
}

export interface SsgResult {
  pages: SsgPage[];
  /** Components a page used that their build declares no stylesheet for */
  unstyled: string[];
  /** Directory the pages were written to */
  outputDirectory: string;
}

export interface SsgOptions {
  /** The teams to render, all of them by default */
  teams?: string[];
  /** Where the pages are written, and the built shell they start from. Defaults to `dist/` */
  outputDirectory?: string;
}

/** A page to render: which team it belongs to, and where its file goes under the output directory */
export interface Page {
  team: string;
  path: string;
  url: string;
  html: string;
  /** Relative to the output directory, eg `products/classic.html` */
  outputFile: string;
  /** The route this page was rendered from, embedded into the page for the shell */
  route: Route;
}

/** Every page a team's route table wants prerendered */
export function pagesFor(
  template: string,
  team: string,
  routes: Route[],
  params: Record<string, string[]>,
): Page[] {
  const router = createRouter(routes);

  return router.routes.flatMap((route) =>
    pathsFor(route, params).map((path) => {
      const rendered = router.render(path);

      if (!rendered) throw new Error(`Route "${route.name}" did not render ${path}`);

      return {
        team,
        path,
        url: CE_ORIGIN + path,
        html: fillStage(template, rendered.html),
        outputFile: outputFileFor(path),
        route,
      };
    }),
  );
}

/**
 * Renders every route of every team and writes the expanded pages to disk.
 *
 * Throws when a page fails to render, comes out with an empty stage, or uses a component no
 * build declares - a page that quietly lost its content, or its styles, is worse than a failed
 * build.
 */
export async function generate(options: SsgOptions = {}): Promise<SsgResult> {
  const outputDirectory = options.outputDirectory ?? OUTPUT_DIR;
  const wanted = options.teams ?? [];
  const teams = wanted.length ? TEAMS.filter(({ name }) => wanted.includes(name)) : TEAMS;

  if (!teams.length) throw new Error(`No team to prerender: ${wanted.join(", ") || "none named"}`);

  const template = await readShell(outputDirectory);
  const styles = await readStyleIndex(outputDirectory);
  const items: Page[] = [];

  for (const team of teams) {
    const routes = await readRoutes(team);

    for (const page of pagesFor(template, team.name, routes, await team.params())) {
      // Two teams writing one file would be a silent last-one-wins, so it is a build failure
      if (items.some(({ path }) => path === page.path)) {
        throw new Error(`Both ${team.name} and another team claim ${page.path}`);
      }

      items.push(page);
    }
  }

  // The render is the project's own dog food: `ceRenderPages` is `ceRenderToString` for a batch
  // - one window, every team's catalog, one page at a time. The stylesheets are linked here
  // instead, because the shell's design system is not a catalog tag and only `component-styles`
  // can name it - so the render is asked not to link any.
  const rendered = await ceRenderPages(
    items.map(({ url, html }) => ({ url, html })),
    {
      builds: teams.map((team) => ({ catalogUrl: `/${team.name}/dist/catalog.js` })),
      roots: STATIC_ROOTS,
      code: codeUrls(teams),
      styles: false,
      // `SSG_TRACE=1` prints what a render is waiting for, which is how to tell a slow page from
      // one that will never settle.
      debug: process.env.SSG_TRACE === "1",
    },
  );

  const prefixes = teams.map(({ name }) => name);
  const unstyledTags = new Set<string>();
  const pages: SsgPage[] = [];

  for (const [index, item] of items.entries()) {
    const page = rendered[index];

    // A stage that is still empty means a component did not upgrade - exactly the failure this
    // pass exists to avoid, so it is reported instead of written silently.
    if (/<vi-router[^>]*>\s*<\/vi-router>/.test(page)) {
      throw new Error(`${item.path} rendered an empty stage, no component was upgraded`);
    }

    const tags = tagsIn(page);
    const undeclared = unknownTags(styles, tags, prefixes);

    if (undeclared.length) {
      throw new Error(`${item.path} uses component(s) no build declares: ${undeclared.join(", ")}`);
    }

    const { urls: pageStyles, unstyled } = stylesForTags(styles, tags);

    unstyled.forEach((tag) => unstyledTags.add(tag));

    // The markup is already in the document, so its stylesheets have to be too. Left to the
    // loader they arrive with the javascript, which paints the page unstyled first.
    //
    // The marker is how the shell knows this page already holds its route's markup, so it can
    // leave it alone instead of rendering the same route over it.
    const marked = markPrerendered(withStylesheets(withRoute(page, item.route), pageStyles), item.path);
    const file = Path.join(outputDirectory, item.outputFile);

    // Nothing has written the file yet, so its directory is made here.
    await FS.mkdir(Path.dirname(file), { recursive: true });
    await FS.writeFile(file, marked);

    pages.push({
      team: item.team,
      path: item.path,
      url: item.url,
      outputFile: file,
      styles: pageStyles,
      bytes: marked.length,
    });
  }

  return { pages, unstyled: [...unstyledTags].sort(), outputDirectory };
}

/* ------------------------------------------------------------------- plugin -- */

/** Prints what the pass wrote */
function report({ pages, unstyled, outputDirectory }: SsgResult, root: string): void {
  for (const page of pages) {
    const file = Path.relative(root, page.outputFile);
    const css = `${page.styles.length} css`;

    console.log(`[ssg] + ${page.path} -> ${file} (${(page.bytes / 1024).toFixed(1)} kB, ${css})`);
  }

  if (unstyled.length) {
    console.warn(`[ssg] ! no stylesheet declared for: ${unstyled.join(", ")}`);
  }

  console.log(
    `[ssg] done, ${pages.length} pages written to ${Path.relative(root, outputDirectory)}`,
  );
}

/**
 * Prerenders the site, as part of the build.
 *
 * `closeBundle` is the hook: by the time it runs the shell and its manifest are on disk, so the
 * pass reads the same output the browser will. It only runs when Vite's `appType` is `custom`,
 * which is how `vite.config.js` says "this build answers its own html" - `npm run build:ssg`.
 *
 * A build that empties `dist/` first (the default) is what makes the pass safe to run in one go:
 * the pages are written over the shell, so a second pass without a rebuild would read a page.
 */
export function ssg(options: SsgOptions = {}): Plugin {
  let config: ResolvedConfig;

  return {
    name: "shell:ssg",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      if (config.appType !== "custom") return;

      const outputDirectory =
        options.outputDirectory ?? Path.resolve(config.root, config.build.outDir);

      report(await generate({ ...options, outputDirectory }), config.root);
    },
  };
}

export default ssg;
