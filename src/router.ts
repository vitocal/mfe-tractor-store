/**
 * Tiny isomorphic router.
 *
 * Runs unchanged in the browser (playground) and in Node (dev server), so it
 * must stay dependency free and side-effect free: no `window`, no `document`
 * and no external packages.
 *
 * A route is a `name`, a readable `path` (with optional `:params`) and a
 * `render` callback that receives the matched parameters and returns html.
 *
 * @example
 * const router = createRouter(routes, { notFound });
 * const { match, html } = router.render("/products/classic");
 */

export type RouteParams = Record<string, string>;

export interface RouteMatch {
  /** Route name, eg: "products-by-category" */
  name: string;
  /** The path pattern that matched, eg: "/products/:category" */
  path: string;
  /** The parameters extracted from the url, eg: { category: "classic" } */
  params: RouteParams;
  /** Everything after "?", so callbacks can read the query string */
  query: URLSearchParams;
}

export interface Route {
  name: string;
  path: string;
  /** Callback that returns the html for the matched route */
  render: (params: RouteParams, match: RouteMatch) => string;
}

export interface Router {
  routes: Route[];
  /** Never null when a `notFound` route is registered */
  match(input: string): RouteMatch | null;
  render(input: string): { match: RouteMatch; html: string } | null;
}

export interface RouterOptions {
  /** Rendered when no route matches, usually the route with path "*" */
  notFound?: Route;
}

/** Regex characters that must be escaped to build the path pattern */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
/** ":param" segments */
const PARAM = /:([A-Za-z_$][\w$]*)/g;

/**
 * Strips the query/hash, guarantees a leading slash, drops trailing slashes and
 * resolves the directory index.
 *
 * "/products/classic/?sku=1" -> "/products/classic"
 * "/products/index.html"     -> "/products"
 *
 * The index resolution is what a static server does for a prerendered build: the
 * "/products/" page is written as "products/index.html", so the same page is reachable
 * as "/products", "/products/" and "/products/index.html" and all three must match the
 * "/products" route.
 */
export function normalizePath(input: string = "/"): string {
  const [pathname = ""] = String(input).split(/[?#]/);
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const index = path.replace(/\/index\.html$/, "/");
  return index.length > 1 ? index.replace(/\/+$/, "") : index;
}

/**
 * Compiles a readable path into a regex and its parameter names.
 * "/products/:category" -> { pattern: /^\/products\/([^/]+)\/?$/, keys: ["category"] }
 * "*" is a catch-all, matching every path.
 */
export function compilePath(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];

  if (path.trim() === "*") return { pattern: /^.*$/, keys };

  const source = normalizePath(path)
    .replace(REGEX_SPECIALS, "\\$&")
    .replace(PARAM, (_, key: string) => {
      keys.push(key);
      return "([^/]+)";
    });

  return { pattern: new RegExp(`^${source}/?$`), keys };
}

/** Finds the first route (declaration order) that matches the url/pathname */
export function matchRoute(routes: Route[], input: string): RouteMatch | null {
  return findRoute(routes, input)?.match ?? null;
}

/**
 * Creates a router for the given route table.
 *
 * With a `notFound` route (usually `path: "*"`), `match` and `render` always
 * resolve something, so unknown paths can be rendered as a 404 page.
 */
export function createRouter(routes: Route[], options: RouterOptions = {}): Router {
  const { notFound } = options;

  const resolve = (input: string) => {
    const found = findRoute(routes, input);
    if (found || !notFound) return found;

    return {
      route: notFound,
      match: { name: notFound.name, path: notFound.path, params: {}, query: parseQuery(input) },
    };
  };

  return {
    routes,
    match: (input) => resolve(input)?.match ?? null,
    render: (input) => {
      const found = resolve(input);
      if (!found) return null;

      return { match: found.match, html: found.route.render(found.match.params, found.match) };
    },
  };
}

function findRoute(routes: Route[], input: string): { route: Route; match: RouteMatch } | null {
  const pathname = normalizePath(input);
  const query = parseQuery(input);

  for (const route of routes) {
    const { pattern, keys } = compilePath(route.path);
    const values = pattern.exec(pathname);

    if (!values) continue;

    const params: RouteParams = {};
    keys.forEach((key, index) => {
      params[key] = decodeParam(values[index + 1]);
    });

    return { route, match: { name: route.name, path: route.path, params, query } };
  }

  return null;
}

function parseQuery(input: string): URLSearchParams {
  const [, search = ""] = String(input).split("#")[0].split("?");
  return new URLSearchParams(search);
}

function decodeParam(value: string = ""): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
