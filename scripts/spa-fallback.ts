import FS from "node:fs";
import Path from "node:path";

import type { Plugin, PreviewServer } from "vite";

import { createRouter, normalizePath, Route } from "../src/router.ts";

import explore_routes from "@mfe-tractor/explore/routes";
import decide_routes from "@mfe-tractor/decide/routes";
import checkout_routes from "@mfe-tractor/checkout/routes";

/** The shell is the only html entry of the dev server */
export const INDEX_HTML = "/index.html";

/** The fallback is for browser navigations only, never for modules, fetches or assets */
export const HTML_ACCEPT_HEADERS = ["text/html", "application/xhtml+xml"];

/** Fallback route, used when no route matches the given path */
export const notFound: Route = {
  name: "not-found",
  path: "*",
  render: () => `<h1>404 - Page Not Found</h1>`,
};

const routes: Route[] = [...explore_routes, ...decide_routes, ...checkout_routes];

const router = createRouter(routes, { notFound });

/** The request bits the fallback needs (the shell doesn't depend on node typings) */
export interface FallbackRequest {
  method?: string;
  url?: string;
  headers?: { accept?: string };
}

/** Does the request accept html? (eg: browser navigations) */
export function acceptsHtml(accept?: string): boolean {
  const value = String(accept ?? "");
  return HTML_ACCEPT_HEADERS.some((header) => value.includes(header));
}

/** Urls with a file extension are assets, never routes (eg: /app.ts, /logo.svg) */
export function isAsset(pathname: string): boolean {
  const segment = pathname.split("/").pop() ?? "";
  return segment.includes(".");
}

/** A page request: a browser navigation, never a module, fetch or asset */
export function isPageRequest(req: FallbackRequest): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  return !isAsset(normalizePath(req.url || "/"));
}

/**
 * Should this request be served by the shell?
 *
 * Which paths are handled comes from the team route tables.
 */
export function shouldFallback(req: FallbackRequest): boolean {
  if (!isPageRequest(req)) return false;
  if (!acceptsHtml(req.headers?.accept)) return false;

  return Boolean(router.match(normalizePath(req.url || "/")));
}

/** Does a file exist? */
function exists(file: string): boolean {
  try {
    FS.accessSync(file);
    return true;
  } catch {
    return false;
  }
}

/** Is there any prerendered page in the output? (a nested index.html) */
function hasPrerenderedPages(outDir: string): boolean {
  try {
    return FS.readdirSync(outDir, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() && exists(Path.join(outDir, entry.name, "index.html")),
    );
  } catch {
    return false;
  }
}

/**
 * Preview server.
 *
 * `vite preview` serves the built files exactly as they are on disk, which is not enough
 * here: the pages are written as `products/index.html` while the app links to `/products`,
 * and routes that were not prerendered (the decide and checkout pages) still have to reach
 * the shell.
 *
 * Resolve both the way a static host would:
 *
 *     try_files $uri $uri/index.html /index.html
 */
export function configurePreviewServer(server: PreviewServer): void {
  const outDir = Path.resolve(server.config.root, server.config.build.outDir);

  if (!hasPrerenderedPages(outDir)) {
    server.config.logger.warn(
      `\n  no prerendered pages found in ${Path.relative(server.config.root, outDir) || "."} - run \`npm run ssg\` to generate them\n`,
    );
  }

  server.middlewares.use((request, _response, next) => {
    if (!isPageRequest(request)) return next();

    const pathname = normalizePath(request.url || "/");

    // A prerendered page for this url is what a static host serves for the directory, no
    // matter what the request accepts
    if (exists(Path.join(outDir, pathname, "index.html"))) {
      request.url = `${pathname === "/" ? "" : pathname}${INDEX_HTML}`;
      return next();
    }

    // Otherwise the shell, so it can route the page client side
    if (shouldFallback(request)) request.url = INDEX_HTML;

    next();
  });
}

/**
 * Spa fallback.
 *
 * Dev: serves the shell html for every html request and leaves the requested url as it is,
 * so the shell can route it client-side against the team routes.
 *
 * Preview: does the same against the built files, preferring a prerendered page when the
 * path has one - see {@link configurePreviewServer}.
 */
export function spaFallback(): Plugin {
  return {
    name: "shell:spa-fallback",
    configureServer(server) {
      server.middlewares.use((request, res, next) => {
        if (!shouldFallback(request)) return next();

        // Rewrite to the shell html, the browser url stays untouched
        request.url = INDEX_HTML;
        next();
      });
    },
    configurePreviewServer,
  };
}

export default spaFallback;
