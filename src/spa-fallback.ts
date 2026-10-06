import type { Plugin } from "vite";

import { createRouter, normalizePath, Route } from "./router.ts";

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

/**
 * Should this request be served by the shell?
 *
 * Which paths are handled comes from the team route tables.
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
 * Serves the shell html for every html request and leaves the requested url as
 * it is, so the shell can route it client-side against the team routes.
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
  };
}

export default spaFallback;
