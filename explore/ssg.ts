/**
 * Static site generation for the explore team.
 *
 * Renders every explore route into a real html file where the page components are
 * already expanded, so crawlers - and the first paint - get the full markup instead
 * of an empty stage:
 *
 *     <vi-router></vi-router>
 *         ->  <vi-router><explore-pages-home><main>…</main></explore-pages-home></vi-router>
 *
 * The expansion is done by Happy DOM's ServerRenderer: it loads the built shell html,
 * puts the route markup inside `<vi-router>`, loads the *built* team components (the
 * very chunks the browser loads) and serializes the resulting document. There is no
 * browser and no hand written template, so the file can not drift from the app -
 * whatever the components render in a browser is what lands in the file.
 *
 * Run with `npm run ssg -w explore`, after `npm run build` (shell) and
 * `npm run build -w explore` (team). Pages are written next to the shell build so a
 * static server can serve them as-is; `--out <dir>` writes them somewhere else.
 */

import FS from "node:fs/promises";
import Path from "node:path";
import { fileURLToPath } from "node:url";

import { ServerRenderer, ServerRendererLogLevelEnum } from "@happy-dom/server-renderer";

import { createRouter } from "../src/router.ts";
import type { Route } from "../src/router.ts";

import routes from "./dist/routes.js";

/* ------------------------------------------------------------------- paths -- */

const TEAM_DIR = Path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = Path.resolve(TEAM_DIR, "..");

/** Built team components, and the url prefix the render fetches them from */
const CHUNKS_DIR = Path.join(TEAM_DIR, "dist", "chunks");
const CHUNKS_URL = toUrlPath(Path.relative(ROOT_DIR, CHUNKS_DIR));

/** The built shell, the page every route starts from */
const SHELL_HTML = Path.join(ROOT_DIR, "dist", "index.html");

/** Where the pages are written by default */
const OUTPUT_DIR = Path.join(ROOT_DIR, "dist");

/** Directories the render may read assets from, tried in order */
const STATIC_ROOTS = [ROOT_DIR, Path.join(ROOT_DIR, "public"), Path.join(ROOT_DIR, "dist")];

/** The pages are rendered for this origin; only its path resolves the assets */
const ORIGIN = "http://localhost:4002";

/** Content types for the files the render asks for */
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

/** `/a/b` -> `/a/b` (relative paths get the leading slash) */
function toUrlPath(path: string): string {
  return `/${path.split(Path.sep).join("/")}`;
}

/* -------------------------------------------------------------- route table -- */

type Database = { categories: Array<{ key: string }> };

const database: Database = JSON.parse(
  await FS.readFile(Path.join(TEAM_DIR, "database", "database.json"), "utf8"),
);

/**
 * Values for the route params, so a pattern like `/products/:category` can be
 * enumerated into concrete pages.
 */
const PARAM_VALUES: Record<string, string[]> = {
  category: database.categories.map(({ key }) => key),
};

/** Every concrete path a route pattern expands to, eg `/products/:category` -> `/products/classic` */
export function pathsFor(route: Route): string[] {
  const names = [...route.path.matchAll(/:([A-Za-z_$][\w$]*)/g)].map(([, name]) => name);

  return names.reduce<string[]>(
    (paths, name) =>
      paths.flatMap((path) =>
        (PARAM_VALUES[name] ?? []).map((value) => path.replace(`:${name}`, value)),
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
 * The shell omits `<head>` and lets the browser infer it. Be explicit, otherwise the
 * parser puts everything that follows into `<body>` and the serialized page loses its
 * head.
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

/** The browser window the interceptor answers requests for */
type RenderWindow = {
  Response: new (body?: string | Uint8Array, init?: unknown) => Response;
};

/** Finds `pathname` in the first static root that has it */
async function readAsset(pathname: string): Promise<{ body: Buffer; type: string } | null> {
  for (const root of STATIC_ROOTS) {
    const file = Path.join(root, pathname);

    try {
      return {
        body: await FS.readFile(file),
        type: MIME_TYPES[Path.extname(file)] ?? "application/octet-stream",
      };
    } catch {
      // try the next root
    }
  }

  return null;
}

/**
 * Builds the interceptor that answers the page's requests from disk.
 *
 * Two kinds of request get an empty body on purpose:
 *
 * - **Stylesheets.** The components preload theirs and the shell has one, but this pass
 *   renders markup, not pixels.
 * - **The shell's own runtime** (`/index.js`, `/cdn/js/helper.js`, …). It re-renders the
 *   stage from the router, which would wipe the very markup being expanded. The written
 *   file keeps those tags, only the render skips them. Everything under the team chunks
 *   is the code that *must* run.
 */
function makeResponder(missing: Set<string>) {
  return async (context: {
    request: { url: string };
    window: RenderWindow;
  }): Promise<Response | undefined> => {
    const { request, window } = context;
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const empty = (type: string) => new window.Response("", { headers: { "content-type": type } });

    if (pathname.endsWith(".css")) return empty("text/css");

    const isComponent = pathname.startsWith(`${CHUNKS_URL}/`);
    if (!isComponent && /\.(js|mjs|ts)$/.test(pathname)) return empty("text/javascript");

    const asset = await readAsset(pathname);
    if (!asset) {
      missing.add(pathname);
      return undefined;
    }

    return new window.Response(asset.body, { headers: { "content-type": asset.type } });
  };
}

/**
 * Runs inside the page before it is serialized: loads every built component so the tags
 * in the route markup upgrade and render themselves, exactly as they do in the browser.
 * It is render-only, so it lives in the configuration instead of the document.
 */
function setupScriptFor(chunks: string[]): string {
  return `
    await Promise.all(
      ${JSON.stringify(chunks)}.map((chunk) => import(${JSON.stringify(CHUNKS_URL)} + "/" + chunk)),
    );
  `;
}

/** The built components: every chunk a custom element was compiled into */
async function findChunks(): Promise<string[]> {
  try {
    const entries = await FS.readdir(CHUNKS_DIR);

    return entries.filter((entry) => entry.endsWith(".ce.js")).sort();
  } catch {
    throw new Error(
      `The built components are missing (${Path.relative(ROOT_DIR, CHUNKS_DIR)}). Run "npm run build -w explore" first.`,
    );
  }
}

/** The built shell, the page every route starts from */
async function readShell(): Promise<string> {
  try {
    return withExplicitHead(await FS.readFile(SHELL_HTML, "utf8"));
  } catch {
    throw new Error(
      `The built shell is missing (${Path.relative(ROOT_DIR, SHELL_HTML)}). Run "npm run build" first.`,
    );
  }
}

/* ---------------------------------------------------------------------- api -- */

export interface SsgPage {
  /** The route path that was rendered, eg `/products/classic` */
  path: string;
  /** The url the page was rendered for */
  url: string;
  /** Absolute path of the written file */
  outputFile: string;
  /** Size of the written file in bytes */
  bytes: number;
}

export interface SsgResult {
  pages: SsgPage[];
  /** Assets the render asked for that no static root could provide */
  missing: string[];
  /** Directory the pages were written to */
  outputDirectory: string;
}

export interface SsgOptions {
  /** Where the pages are written, defaults to the shell build (`dist/`) */
  outputDirectory?: string;
}

/**
 * Renders every explore route and writes the expanded pages to disk.
 *
 * Throws when a page fails to render or comes out with an empty stage - a page that
 * silently lost its content is worse than a failed build.
 */
export async function generate(options: SsgOptions = {}): Promise<SsgResult> {
  const outputDirectory = options.outputDirectory ?? OUTPUT_DIR;
  const template = await readShell();
  const chunks = await findChunks();
  const router = createRouter(routes as Route[]);

  const items = (routes as Route[]).flatMap((route) =>
    pathsFor(route).map((path) => {
      const rendered = router.render(path);

      if (!rendered) throw new Error(`Route "${route.name}" did not render ${path}`);

      return {
        url: ORIGIN + path,
        html: fillStage(template, rendered.html),
        outputFile: outputFileFor(path),
      };
    }),
  );

  const missing = new Set<string>();

  const renderer = new ServerRenderer({
    logLevel: ServerRendererLogLevelEnum.error,
    outputDirectory,
    // A worker receives its configuration through structured cloning, which can not carry
    // the fetch interceptor (a function), so the render runs in this process.
    worker: { disable: true },
    // One page at a time: they share a browser, and a failure stays attributable.
    render: { maxConcurrency: 1, setupScript: setupScriptFor(chunks) },
    browser: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      fetch: { interceptor: { beforeAsyncRequest: makeResponder(missing) } },
    },
  });

  let results;

  try {
    results = await renderer.render(items);
  } finally {
    await renderer.close();
  }

  const pages: SsgPage[] = [];

  for (const result of results) {
    const path = result.url?.slice(ORIGIN.length) || "?";
    const problem = result.error ?? result.pageErrors[0];

    if (problem) throw new Error(`${path} failed to render: ${problem}`);
    if (!result.outputFile) throw new Error(`${path} produced no output file`);

    const written = await FS.readFile(result.outputFile, "utf8");

    // A stage that is still empty means a component did not upgrade - exactly the failure
    // this pass exists to avoid, so it is reported instead of written silently.
    if (/<vi-router[^>]*>\s*<\/vi-router>/.test(written)) {
      throw new Error(`${path} rendered an empty stage, no component was upgraded`);
    }

    pages.push({
      path,
      url: result.url ?? "",
      outputFile: result.outputFile,
      bytes: written.length,
    });
  }

  return { pages, missing: [...missing].sort(), outputDirectory };
}

/* ---------------------------------------------------------------------- cli -- */

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf("--out");
  const outputDirectory =
    outIndex === -1 ? undefined : Path.resolve(process.cwd(), process.argv[outIndex + 1] ?? "");

  console.log(`[ssg] explore: rendering ${(routes as Route[]).length} routes`);

  const { pages, missing, outputDirectory: out } = await generate({ outputDirectory });

  for (const page of pages) {
    const file = Path.relative(ROOT_DIR, page.outputFile);
    console.log(`[ssg] + ${page.path} -> ${file} (${(page.bytes / 1024).toFixed(1)} kB)`);
  }

  if (missing.length) {
    console.warn(`[ssg] ! ${missing.length} asset(s) not found: ${missing.join(", ")}`);
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

