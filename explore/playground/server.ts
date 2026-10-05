import type { Plugin } from "vite";

import { createRouter, normalizePath, Route } from "../../src/router.ts";
import routes from "../routes.ts";

/** The playground is the only html entry of the dev server */
export const PLAYGROUND_INDEX = "/playground/index.html";

/** The fallback is for browser navigations only, never for modules, fetches or assets */
export const HTML_ACCEPT_HEADERS = ["text/html", "application/xhtml+xml"];

/** Fallback route, used when no route matches the given path */
export const notFound: Route = {
  name: "not-found",
  path: "*",
  render: () => `<h1>404 - Page Not Found</h1>`,
};

const router = createRouter(routes, { notFound });

/** The request bits the fallback needs (this team doesn't depend on node typings) */
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

/** Urls with a file extension are assets, never routes (eg: /catalog.ts, /logo.svg) */
export function isAsset(pathname: string): boolean {
  const segment = pathname.split("/").pop() ?? "";
  return segment.includes(".");
}

/**
 * Should this request be served by the playground?
 *
 * Which paths are handled comes from the routes file (routes.ts).
 */
export function shouldFallback(req: FallbackRequest): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!acceptsHtml(req.headers?.accept)) return false;

  const pathname = normalizePath(req.url || "/");
  if (isAsset(pathname)) return false;

  return Boolean(router.match(pathname));
}

/**
 * Spa fallback.
 *
 * Serves the playground for every html request and leaves the requested url as
 * it is, so the playground can route it client-side against the team routes.
 */
export function playgroundFallback(): Plugin {
  return {
    name: "explore:playground-fallback",
    configureServer(server) {
      server.middlewares.use((request, res, next) => {
        if (!shouldFallback(request)) return next();

        // Rewrite to the playground, the browser url stays untouched
        request.url = PLAYGROUND_INDEX;
        next();
      });
    },
  };
}

export default playgroundFallback;
