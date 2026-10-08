/**
 * Renders custom elements to html, without a browser.
 *
 * A page ships its components as custom elements: the markup says
 * `<explore-pages-home></explore-pages-home>`, and the browser fills it in once the catalog has
 * loaded the module the tag belongs to. Anything that reads that html *without* running a
 * browser - a crawler, an express server, the prerender pass - gets an empty tag where the page
 * should be.
 *
 * This expands those tags for them, by loading the same two things the browser loads: the
 * *built* catalog, and the *built* modules the catalog points at. The html that comes back is
 * the html the browser would have ended up with.
 *
 * A fragment is as good as a whole document, and a render never reaches the network: every
 * request is answered from disk, or not at all.
 */

import FS from "node:fs/promises";
import Path from "node:path";

import { ServerRenderer, ServerRendererLogLevelEnum } from "@happy-dom/server-renderer";
import type { IFetchInterceptor, IOptionalBrowserSettings } from "happy-dom";

import { tagsIn, withStylesheets } from "./component-styles.ts";
import type { Manifest } from "./component-styles.ts";

/* ------------------------------------------------------------------ assets -- */

/** The origin a render pretends to be. Only the path matters: it resolves relative assets. */
export const CE_ORIGIN = "http://localhost";

/** Content types for the files a render asks for */
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

/** What a render keeps track of while it runs */
export interface CeAssetState {
  /** Url prefixes of the built code the render may run. Any other script is served empty. */
  code: string[];
  /** Directories built files are read from, tried in order */
  roots: string[];
  /** Assets the render asked for that no root could provide */
  missing: Set<string>;
}

/** Finds `pathname` in the first root that has it */
async function readAsset(
  roots: string[],
  pathname: string,
): Promise<{ body: Buffer; type: string } | null> {
  for (const root of roots) {
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
 * Splits `import Default,{named as alias}from"…"` into two imports of the same module.
 *
 * happy-dom compiles a module by rewriting its import statements with a regex that needs
 * `import` followed by whitespace or `{`, so a default import *and* named imports in one
 * statement is left half rewritten. The module then fails to parse, and the render waits for a
 * module that will never load rather than failing - a 30 second timeout per page.
 *
 * The statement is valid esm and the browser is happy with it; a bundler emits it whenever a
 * module exports both a default and something another module needs (checkout's line item
 * component re-exports the `upgradedProps` action). Splitting it is equivalent, and only the
 * render ever sees the rewritten chunk.
 */
export function splitMixedImports(source: string): string {
  return source.replace(
    /import\s+([A-Za-z0-9_$]+)\s*,\s*\{([^}]*)\}\s*from\s*("([^"]*)"|'([^']*)')\s*;?/g,
    (_match, name: string, named: string, from: string) =>
      `import ${name} from ${from};import{${named}}from${from};`,
  );
}

/**
 * `import.meta.resolve`, replaced with the fallback it guards.
 *
 * happy-dom's module compiler can not handle it, and a module it can not compile does not fail:
 * the render waits for an import that will never resolve, and every page times out. The
 * expression is `import.meta.resolve ? import.meta.resolve(e) : new URL(e, import.meta.url).href`
 * - the fallback resolves a relative specifier to the same url - so the render takes it.
 */
function withoutImportMetaResolve(source: string): string {
  return source.replace(/import\.meta\.resolve\?import\.meta\.resolve\(e\):/, "");
}

/**
 * A built module without the bundler's preloading.
 *
 * Every lazy loader a bundler emits is wrapped in its preload helper:
 *
 *     () => n(() => import("./chunks/home.ce.js"), __vite__mapDeps([5, 3, 4]), import.meta.url)
 *
 * The helper creates a `<link rel="modulepreload">` per dependency - and a `<link rel="stylesheet">`
 * it then *waits for* - each resolved against `import.meta.url`. In a browser that is what keeps a
 * component from being painted unstyled. In a render it is two failures at once:
 *
 * - the stylesheets come from the build manifest instead, so a render that waits on a `<link>` it
 *   never asked for only defines its components once the page has already been serialized;
 * - a link resolved against `import.meta.url` is resolved against the *render's* origin
 *   (`http://localhost`), and the render serializes the document it ends up with - so the link is
 *   written into the page and the browser asks port 80 of the visitor's own machine for a chunk.
 *
 * Emptying the dependency list stops both: the helper only touches the document when it has
 * dependencies to preload (`if (deps && deps.length > 0)`), and a loader called with no
 * dependencies is the import itself. Matching the *list* rather than the call shape is what makes
 * that hold for every loader a bundler emits - a module factory wrapped in the helper
 * (`n(async () => { … }, __vite__mapDeps([0, 1]), import.meta.url)`, which decide's catalog uses
 * for its Vue runtime) as much as a bare `import()`.
 */
function withoutPreload(source: string): string {
  return source.replace(/__vite__mapDeps\(\[[^\]]*\]\)/g, "[]");
}

/** A built module as a render needs it: importable, and without the bundler's preloading */
export function renderable(source: string): string {
  return withoutPreload(withoutImportMetaResolve(splitMixedImports(source)));
}

/**
 * Answers the page's requests from disk.
 *
 * Two kinds of request get an empty body on purpose:
 *
 * - **Scripts outside the built code** - the shell's own runtime above all. Booting the router
 *   inside a render would re-render the stage that is being expanded. Everything under the
 *   prefixes in `state.code` is the code that *must* run.
 * - **Anything on another origin.** A component may import a third party module - the checkout
 *   thanks page imports canvas-confetti from a cdn - and a render has no network to offer it.
 *   The page reports the failure, and its markup is unaffected: it is rendered before that
 *   import resolves.
 *
 * Stylesheets are not answered here at all: `ceBrowserSettings` turns stylesheet loading off,
 * because a render links the styles a page needs from the build manifest instead.
 */
export function createAssetResponder(state: CeAssetState): IFetchInterceptor {
  return {
    async beforeAsyncRequest({ request, window }) {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      const empty = (type: string) =>
        new window.Response("", { headers: { "content-type": type } });

      if (process.env.CE_RENDER_TRACE === "1") console.error(`[ce-render] fetch ${pathname}`);

      if (url.origin !== CE_ORIGIN) {
        return empty(MIME_TYPES[Path.extname(pathname)] ?? "text/plain");
      }

      const isCode = state.code.some((prefix) => pathname.startsWith(prefix));

      if (!isCode && /\.(js|mjs|ts)$/.test(pathname)) return empty("text/javascript");

      const asset = await readAsset(state.roots, pathname);

      if (!asset) {
        state.missing.add(pathname);
        return undefined;
      }

      const body =
        isCode && asset.type === "text/javascript"
          ? renderable(asset.body.toString("utf8"))
          : asset.body;

      return new window.Response(body, { headers: { "content-type": asset.type } });
    },
  };
}

/* -------------------------------------------------------------- components -- */

/**
 * Runs inside the page before it is serialized: loads every component through the catalog it is
 * served under, so the tags in the markup upgrade and render themselves as they do in a browser.
 *
 * The catalog is what the browser's loader reads too, and it has to be: a team's catalog is
 * where its components are *defined*. A Preact or Svelte component registers itself when its
 * module is imported, but a Vue one is turned into a custom element by the catalog
 * (`defineCustomElement`), so importing the chunk alone would leave `<decide-pages-product>`
 * undefined and the page rendered as a placeholder.
 *
 * A page uses components from more than one team - a checkout page uses explore's header, a
 * decide page uses checkout's add to cart - so every team's catalog is loaded, and the
 * stylesheets are narrowed back down per page afterwards.
 *
 * It is render-only, so it lives in the configuration instead of the document.
 */
export function ceSetupScript(catalogs: string[]): string {
  return `
    try {
      for (const url of ${JSON.stringify(catalogs)}) {
        const catalog = (await import(url)).default;

        for (const [tag, load] of Object.entries(catalog)) {
          if (customElements.get(tag)) continue;

          const component = await load();

          // A catalog that hands back a custom element class expects the loader to register it.
          // A component that registers itself returns its module instead, so this is a no-op.
          if (typeof component === "function" && component.prototype instanceof HTMLElement) {
            customElements.define(tag, component);
          }
        }
      }
    } catch (error) {
      // The renderer does not await this script, so a failure here would otherwise only show up
      // as a page that quietly rendered placeholders. Stamp it on the document instead, and let
      // the caller read it back out of the html it gets.
      document.documentElement.setAttribute("data-render-error", String(error));
    }
  `;
}

/** The attribute `ceSetupScript` stamps on a document whose components would not load */
const RENDER_ERROR_ATTRIBUTE = "data-render-error";

/** The error `ceSetupScript` recorded, if it recorded one */
export function renderError(html: string): string | null {
  return new RegExp(`${RENDER_ERROR_ATTRIBUTE}="([^"]*)"`).exec(html)?.[1] ?? null;
}

/* ----------------------------------------------------------------- browser -- */

/**
 * The browser settings a custom element render needs.
 *
 * `disableCSSFileLoading` is what keeps a render off the network, but on its own it makes every
 * component preload *hang*: the bundler's preload helper fetches a component's stylesheet and
 * waits for the `<link>` to load, and a stylesheet that is never fetched never loads. A render
 * then waits out its whole timeout on the first component that has styles.
 *
 * `handleDisabledFileLoadingAsSuccess` closes that hole. A skipped file counts as a loaded one,
 * which is the truth for a render: the stylesheets a page gets are chosen from the build
 * manifest, not fetched.
 */
export function ceBrowserSettings(interceptor: IFetchInterceptor): IOptionalBrowserSettings {
  return {
    enableJavaScriptEvaluation: true,
    suppressInsecureJavaScriptEnvironmentWarning: true,
    disableCSSFileLoading: true,
    handleDisabledFileLoadingAsSuccess: true,
    // A component may animate on mount - the checkout thanks page runs a confetti loop for a
    // few seconds. Nothing in a render needs to finish animating, and a loop keeps the render
    // waiting until it times out.
    timer: { preventTimerLoops: true },
    fetch: { interceptor },
  };
}

/* ------------------------------------------------------------------ styles -- */

/** `assets/home-abc.css` -> `/assets/home-abc.css`, so the url resolves from any page depth */
function toUrl(file: string): string {
  return `/${file.replace(/^\/+/, "")}`;
}

/**
 * The tail every tag for a module ends with: `./pages/home.ce.tsx` -> `pages-home`.
 *
 * A build names a component after the module it was compiled from, joined with dashes, with the
 * custom element extension dropped.
 */
function tagTail(module: string): string {
  return module
    .replace(/^\.\//, "")
    .replace(/\.[^./]+$/, "")
    .replace(/\.ce$/, "")
    .split("/")
    .join("-");
}

/**
 * A catalog, as far as a render is concerned: tag name -> loader.
 *
 * `ce-autoloader` exports a `Catalog` of its own, but its `exports` map only re-exports the
 * default, so the type is not reachable from the package root - hence this one. Nothing here
 * calls a loader anyway: a render is handed the catalog's *url*, and the page's own setup script
 * loads the components. All a render reads is the tag names.
 */
export type Catalog = Record<string, unknown>;

/**
 * The stylesheets the tags in `html` need, resolved from a build manifest.
 *
 * The manifest says which stylesheet each module was compiled into; the catalog says which tags
 * exist. A module is matched to a tag by its tail, so a component is linked by the name its own
 * loader knows it by, and a module that is not a component - `routes.ts`, the shared chunks -
 * matches nothing and is skipped.
 *
 * A build that names its components some other way - the shell's design system calls
 * `src/components/button.tsx` `ds-button` - is not covered here; that build's tags are resolved
 * by the caller (`designSystemBuild` in `component-styles.ts`).
 */
export function stylesFor(html: string, manifest: Manifest, catalog: Catalog): string[] {
  const wanted = new Set(tagsIn(html));
  const urls = new Set<string>();

  for (const [module, output] of Object.entries(manifest)) {
    const tail = tagTail(module);
    const tag = Object.keys(catalog).find((name) => name === tail || name.endsWith(`-${tail}`));

    if (!tag || !wanted.has(tag)) continue;

    for (const css of output.css ?? []) urls.add(toUrl(css));
  }

  return [...urls].sort();
}

/* ------------------------------------------------------------------ render -- */

export interface CeRenderOptions {
  /** The url the html is rendered for. Only its path matters: it resolves relative assets. */
  url?: string;
  /** The url the built catalog is served under, eg `/explore/dist/catalog.js` */
  catalogUrl?: string;
  /** Directories built files are read from, tried in order. Defaults to the working directory */
  roots?: string[];
  /** Url prefixes of the built code the render may run. Defaults to the catalog's own directory */
  code?: string[];
  /** Milliseconds a render may take before it is abandoned */
  timeout?: number;
  /** Prints what the render is waiting for, which is how to tell a slow render from a stuck one */
  debug?: boolean;
  /**
   * Link the stylesheets the expanded tags need. Defaults to true. A caller that resolves the
   * stylesheets itself - the prerender does, because the shell's design system is not a catalog
   * tag - turns it off.
   */
  styles?: boolean;
}

/** A build the pages of a batch render through */
export interface CeRenderBuild {
  /** The url the build's catalog is served under, eg `/explore/dist/catalog.js` */
  catalogUrl: string;
  /** The build's catalog: tag -> loader, the same file the browser loads. Read only to link styles. */
  catalog?: Catalog;
  /** What the build emitted, and which stylesheet each module was compiled into. Read only to link styles. */
  manifest?: Manifest;
}

/** One page of a batch */
export interface CeRenderPage {
  /** The url the page is rendered for. Only its path matters: it resolves relative assets. */
  url?: string;
  /** The page's html, with its custom elements still unexpanded */
  html: string;
}

export interface CeRenderPagesOptions {
  /**
   * The builds the batch renders through: one for every team that has a page in it, and for every
   * team whose components those pages use. One renderer serves the batch, so its catalogs are all
   * loaded up front.
   */
  builds: CeRenderBuild[];
  /** Directories built files are read from, tried in order. Defaults to the working directory */
  roots?: string[];
  /** Url prefixes of the built code the render may run. Defaults to every build's own directory */
  code?: string[];
  /** Milliseconds a batch may take before it is abandoned */
  timeout?: number;
  /** Prints what the render is waiting for, which is how to tell a slow render from a stuck one */
  debug?: boolean;
  /**
   * Link the stylesheets each page's components need. Defaults to true. A caller that resolves
   * the stylesheets itself - the prerender does, for the shell's design system - turns it off.
   */
  styles?: boolean;
}

/** The url a page is rendered for: it is served at the origin's root unless it says otherwise */
function urlOf(page: CeRenderPage): string {
  return page.url ?? `${CE_ORIGIN}/`;
}

/** The directory a catalog is served under, which is also where the code it loads lives */
function catalogDir(catalogUrl: string): string {
  return catalogUrl.slice(0, catalogUrl.lastIndexOf("/") + 1);
}

/**
 * The stylesheets the tags in `html` need, resolved against every build in a batch.
 *
 * Each build is asked about its own manifest, so a page that uses another team's components is
 * linked that team's stylesheets too - which is what a batch has and a single build can not know.
 */
function stylesForBuilds(html: string, builds: CeRenderBuild[]): string[] {
  const urls = new Set<string>();

  for (const build of builds) {
    // A build with no catalog or manifest has no styles to resolve; the caller links them.
    if (!build.catalog || !build.manifest) continue;

    for (const url of stylesFor(html, build.manifest, build.catalog)) urls.add(url);
  }

  return [...urls].sort();
}

/**
 * Expands the custom elements in every page, and returns each page's html with its stylesheets
 * linked.
 *
 * This is `ceRenderToString` for more than one page, and it is faster for the reason the prerender
 * pass is: the window, the catalogs and the module registry are built once and reused, and that
 * setup is what a render costs - a page with nothing in it pays almost all of it. Rendering a
 * page at a time means paying it per page; rendering a batch means paying it once.
 *
 * One renderer serves the whole batch, so every build the pages need has to be listed in `builds`:
 * the catalogs are loaded up front, and a page that uses another team's components needs that
 * team's catalog there. Stylesheets are still resolved per page, against the build that declares
 * its tags.
 *
 * Every page needs a url of its own. A render answers with the url it was for, and the answer is
 * matched to the page by that url - so a batch of pages that share one is a batch whose pages
 * would be answered with each other's html.
 *
 * Throws when a page fails, naming it: a page that quietly lost its content is worse than a failed
 * request.
 */
export async function ceRenderPages(
  pages: CeRenderPage[],
  options: CeRenderPagesOptions,
): Promise<string[]> {
  const { builds, timeout = 30000, styles = true } = options;

  if (!builds.length) {
    throw new Error(
      "ceRenderPages needs a build to render through, eg the catalog and manifest of a team.",
    );
  }

  const catalogUrls = builds.map((build) => build.catalogUrl);
  const urls = pages.map(urlOf);

  // A render answers with the url it was for, and the answer is matched to the page by that url,
  // so two pages can not share one: the second would be answered with the first one's html.
  if (new Set(urls).size !== urls.length) {
    throw new Error("ceRenderPages needs a distinct url for every page in the batch.");
  }

  const state: CeAssetState = {
    code: options.code ?? catalogUrls.map(catalogDir),
    roots: options.roots ?? [process.cwd()],
    missing: new Set<string>(),
  };

  const renderer = new ServerRenderer({
    logLevel: ServerRendererLogLevelEnum.error,
    debug: options.debug ?? false,
    // A worker receives its configuration through structured cloning, which can not carry the
    // fetch interceptor (a function), so the render runs in this process.
    worker: { disable: true },
    // One page at a time: they share a browser, and a page that fails stays attributable.
    render: { maxConcurrency: 1, setupScript: ceSetupScript(catalogUrls), timeout },
    browser: ceBrowserSettings(createAssetResponder(state)),
  });

  let results: { url?: string; content?: string; error?: string }[] = [];

  try {
    results = await renderer.render(
      pages.map((page) => ({ url: urlOf(page), html: page.html })),
    );
  } finally {
    await renderer.close();
  }

  const missing = [...state.missing].sort();
  const assets = missing.length ? `\nAssets no root could provide: ${missing.join(", ")}` : "";
  // Results come back tagged with the url they are for, and not in the order the pages were given,
  // so they are matched by url rather than by position.
  const byUrl = new Map(results.map((result) => [result.url ?? "", result]));

  return pages.map((page) => {
    const url = urlOf(page);
    const result = byUrl.get(url);

    if (!result || result.error) {
      throw new Error(`Could not render ${url}: ${result?.error ?? "no result"}${assets}`);
    }

    const rendered = result.content ?? "";
    const failed = renderError(rendered);

    if (failed) throw new Error(`Could not load the components for ${url}: ${failed}`);

    return styles ? withStylesheets(rendered, stylesForBuilds(rendered, builds)) : rendered;
  });
}

/**
 * Expands the custom elements in `html`, and returns the html with their stylesheets linked.
 *
 * The manifest and the catalog are the two things a build already publishes: what it emitted
 * (and which stylesheet each module needs), and where each tag's module lives. Together they
 * are enough to render the markup the way the browser would, which is what a server that wants
 * to answer with html - instead of a shell that fills itself in later - needs.
 *
 * This is `ceRenderPages` for a single page against a single build. A caller with more than one
 * page should use that instead, and pay the render's setup once rather than per page.
 *
 * Throws when the render fails, or when a component would not load: a page that quietly lost
 * its content is worse than a failed request.
 */
export async function ceRenderToString(
  html: string,
  manifest: Manifest,
  catalog: Catalog,
  options: CeRenderOptions = {},
): Promise<string> {
  const { catalogUrl } = options;

  if (!catalogUrl) {
    throw new Error(
      'ceRenderToString needs the url its catalog is served under, eg "/explore/dist/catalog.js".',
    );
  }

  const [rendered] = await ceRenderPages([{ url: options.url, html }], {
    builds: [{ catalogUrl, catalog, manifest }],
    roots: options.roots,
    code: options.code,
    timeout: options.timeout,
    debug: options.debug,
    styles: options.styles,
  });

  return rendered;
}
