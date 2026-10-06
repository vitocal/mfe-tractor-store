/**
 * Static site generation for every team that has a route table.
 *
 * Renders each team's routes into real html files where the page components are already
 * expanded, so crawlers - and the first paint - get the full markup instead of an empty stage:
 *
 *     <vi-router></vi-router>
 *         ->  <vi-router><explore-pages-home><main>…</main></explore-pages-home></vi-router>
 *
 * The expansion is done by Happy DOM's ServerRenderer: it loads the built shell html, puts the
 * route markup inside `<vi-router>`, loads the *built* team components (the very chunks the
 * browser loads) and serializes the resulting document. There is no browser and no hand written
 * template, so the files can not drift from the app - whatever the components render in a
 * browser is what lands in the file.
 *
 * Every team is rendered in one run, from one read of the shell, because the run overwrites the
 * shell's own `dist/index.html` with the root page: a later pass reading it back would be
 * reading a page, not the shell. `--team <name>` narrows a run down, and the marker and the
 * style block survive that, but the plain run is the one to use.
 *
 * Run with `npm run ssg`, after `npm run build --workspaces` and `npm run build`. Pages are
 * written next to the shell build so a static server can serve them as-is; `--out <dir>` writes
 * them somewhere else.
 */

import FS from "node:fs/promises";
import Path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ServerRenderer, ServerRendererLogLevelEnum } from "@happy-dom/server-renderer";

import { createRouter } from "../src/router.ts";
import type { Route } from "../src/router.ts";
import { tagsIn } from "../src/tags.ts";
import { markPrerendered } from "./prerendered.ts";
import {
  CE_ORIGIN,
  ceBrowserSettings,
  ceSetupScript,
  createAssetResponder,
  renderError,
} from "./ce-render.ts";
import type { CeAssetState } from "./ce-render.ts";
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

/** The built shell, the page every route starts from */
const SHELL_HTML = Path.join(ROOT_DIR, "dist", "index.html");

/** Where the pages are written by default */
const OUTPUT_DIR = Path.join(ROOT_DIR, "dist");

/** Directories the render may read assets from, tried in order */
const STATIC_ROOTS = [ROOT_DIR, Path.join(ROOT_DIR, "public"), Path.join(ROOT_DIR, "dist")];

/** Where a build wrote its manifest */
function manifestFile(dir: string): string {
  return Path.join(dir, "dist", ".vite", "manifest.json");
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

/** `/products/classic` -> `products/classic/index.html`, `/` -> `index.html` */
export function outputFileFor(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/index.html` : "index.html";
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

/* -------------------------------------------------------------------- render -- */

/* The render itself lives in `ce-render.ts`: it is the same machinery a server needs to
 * answer with html, and the pass is one caller of it. What stays here is what is specific to
 * prerendering a site - the route tables, the pages to write, and the stylesheets to link. */

/* --------------------------------------------------------------- build data -- */

/** The manifest a build wrote: every module it emitted, with the stylesheet it needs */
async function readManifest(dir: string, build: string): Promise<Manifest> {
  const file = manifestFile(dir);

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
async function readStyleIndex(): Promise<Map<string, string[]>> {
  const builds: ComponentBuild[] = [designSystemBuild(await readManifest(ROOT_DIR, "shell"))];

  for (const team of TEAMS) {
    const manifest = await readManifest(Path.join(ROOT_DIR, team.name), team.name);

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

/**
 * The catalogs the render loads components through: a team publishes its catalog as its main
 * entry, and `catalog.ts` is what turns a team's modules into custom elements.
 */
function catalogUrls(teams: readonly Team[]): string[] {
  return teams.map((team) => `/${team.name}/dist/catalog.js`);
}

/** The built shell, the page every route starts from */
async function readShell(): Promise<string> {
  try {
    // The pass writes the root page over the shell html, so a narrowed run reads a page back
    // instead of the shell. Drop the block a previous run added, or every page would inherit
    // the root page's stylesheets on top of its own.
    const shell = withoutStylesheets(await FS.readFile(SHELL_HTML, "utf8"));

    return withExplicitHead(shell);
  } catch {
    throw new Error(
      `The built shell is missing (${Path.relative(ROOT_DIR, SHELL_HTML)}). Run "npm run build" first.`,
    );
  }
}

/** The built route table of a team */
async function readRoutes(team: Team): Promise<Route[]> {
  const file = Path.join(ROOT_DIR, team.name, "dist", "routes.js");

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
  /** Errors the page reported while rendering, eg a third party import the render can not load */
  errors: string[];
  /** Size of the written file in bytes */
  bytes: number;
}

export interface SsgResult {
  pages: SsgPage[];
  /** Assets the render asked for that no static root could provide */
  missing: string[];
  /** Components a page used that their build declares no stylesheet for */
  unstyled: string[];
  /** Directory the pages were written to */
  outputDirectory: string;
}

export interface SsgOptions {
  /** The teams to render, all of them by default */
  teams?: string[];
  /** Where the pages are written, defaults to the shell build (`dist/`) */
  outputDirectory?: string;
}

/** A page to render: which team it belongs to, and what to write where */
interface Page {
  team: string;
  path: string;
  url: string;
  html: string;
  outputFile: string;
}

/** Every page a team's route table wants prerendered */
function pagesFor(
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

  const template = await readShell();
  const styles = await readStyleIndex();
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

  const state: CeAssetState = {
    code: codeUrls(teams),
    roots: STATIC_ROOTS,
    missing: new Set<string>(),
  };
  const unstyledTags = new Set<string>();

  const renderer = new ServerRenderer({
    logLevel: ServerRendererLogLevelEnum.error,
    outputDirectory,
    // `SSG_TRACE=1` prints what a render is waiting for, which is how to tell a slow page from
    // one that will never settle.
    debug: process.env.SSG_TRACE === "1",
    // A worker receives its configuration through structured cloning, which can not carry the
    // fetch interceptor (a function), so the render runs in this process.
    worker: { disable: true },
    // One page at a time: they share a browser, and a failure stays attributable.
    render: { maxConcurrency: 1, setupScript: ceSetupScript(catalogUrls(teams)) },
    browser: ceBrowserSettings(createAssetResponder(state)),
  });

  let results;

  try {
    results = await renderer.render(items);
  } finally {
    await renderer.close();
  }

  const itemsByUrl = new Map(items.map((item) => [item.url, item]));
  const prefixes = teams.map(({ name }) => name);
  const pages: SsgPage[] = [];

  for (const result of results) {
    const item = itemsByUrl.get(result.url ?? "");

    if (!item) throw new Error(`The renderer returned a page nobody asked for: ${result.url}`);
    if (result.error) {
      const missing = [...state.missing].sort();
      const assets = missing.length
        ? `\nAssets no static root could provide: ${missing.join(", ")}`
        : "";

      throw new Error(`${item.path} failed to render: ${result.error}${assets}`);
    }
    if (!result.outputFile) throw new Error(`${item.path} produced no output file`);

    const written = await FS.readFile(result.outputFile, "utf8");

    // A stage that is still empty means a component did not upgrade - exactly the failure this
    // pass exists to avoid, so it is reported instead of written silently.
    if (/<vi-router[^>]*>\s*<\/vi-router>/.test(written)) {
      throw new Error(`${item.path} rendered an empty stage, no component was upgraded`);
    }

    // The setup script stamps this on the document when it can not load a component. Without
    // the check the page would be written with placeholders where its content should be.
    const failed = renderError(written);

    if (failed) throw new Error(`${item.path} could not load its components: ${failed}`);

    const tags = tagsIn(written);
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
    const page = markPrerendered(withStylesheets(written, pageStyles), item.path);

    if (page !== written) await FS.writeFile(result.outputFile, page);

    pages.push({
      team: item.team,
      path: item.path,
      url: result.url ?? "",
      outputFile: result.outputFile,
      styles: pageStyles,
      errors: result.pageErrors ?? [],
      bytes: page.length,
    });
  }

  return {
    pages,
    missing: [...state.missing].sort(),
    unstyled: [...unstyledTags].sort(),
    outputDirectory,
  };
}

/* ---------------------------------------------------------------------- cli -- */

/** The teams named by `--team <name>`, if any */
function requestedTeams(args: string[]): string[] {
  const teams: string[] = [];

  for (const [index, arg] of args.entries()) {
    if (arg === "--team" && args[index + 1]) teams.push(args[index + 1]);
  }

  return teams;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outputDirectory =
    outIndex === -1 ? undefined : Path.resolve(process.cwd(), args[outIndex + 1] ?? "");

  const teams = requestedTeams(args);
  const names = teams.length ? teams : TEAMS.map(({ name }) => name);

  console.log(`[ssg] prerendering ${names.join(", ")}`);

  const { pages, missing, unstyled, outputDirectory: out } = await generate({ teams, outputDirectory });

  for (const page of pages) {
    const file = Path.relative(ROOT_DIR, page.outputFile);
    const css = `${page.styles.length} css`;

    console.log(`[ssg] + ${page.path} -> ${file} (${(page.bytes / 1024).toFixed(1)} kB, ${css})`);

    // A page may throw after its markup is rendered - the thanks page imports canvas-confetti
    // from a cdn, which this render can not load. The file is complete either way, so it is
    // reported rather than failing the build.
    for (const error of page.errors) {
      console.warn(`[ssg] ! ${page.path}: ${String(error).split("\n")[0]}`);
    }
  }

  if (missing.length) {
    console.warn(`[ssg] ! ${missing.length} asset(s) not found: ${missing.join(", ")}`);
  }

  if (unstyled.length) {
    console.warn(`[ssg] ! no stylesheet declared for: ${unstyled.join(", ")}`);
  }

  console.log(`[ssg] done, ${pages.length} pages written to ${Path.relative(ROOT_DIR, out)}`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`[ssg] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
