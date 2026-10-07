import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";
import { createRibbon } from "./ribbon";
import type { Route } from "./router";

// The marker a prerendered page carries, and the route it exposes on a global - both written by
// the SSG pass. See `scripts/prerendered.ts` for the other half of the contract.
import { PRERENDERED_ATTRIBUTE, PRERENDERED_ROUTE_GLOBAL } from "../scripts/prerendered";

/**
 * The shell, shared by both modes.
 *
 * It's task is to "hydrate" the page with web-components via ce-autoloader.
 *
 * In SSR (pre-rendered mode), the routing is server side (at compile time)
 * It SPA mode, it's client-side:
 *  They'll all have a shared isomorphic `routes.ts`.
 *
 * But with some caveat:
 *   - Routes with query parameters(?something) only run client-side, so the SSG writes the
 *     route it rendered each page from onto a global (`PRERENDERED_ROUTE_GLOBAL`) and the shell
 *     re-renders it from there - generically, importing no team's route table.
 *
 * - no prerender_mark: a bare SPA shell. The routing and render is done client side.
 * - prerender_mark === path, with a query string: Must also be re-done at client-side, from the
 *   embedded route.
 *
 * - prerender_mark === path, no query: a prerendered page. Its markup is already in the stage, so the
 *   ce-autoloader upgrading that markup is the whole job. No local routing needed.
 *
 * - prerender_mark !== path: the url is not the one this document was prerendered for, and there is no
 *   router to render it, so it is a 404.
 */

/**
 * The shell stage.
 *
 * `vi-router` is a plain, non-catalog custom element: registering it makes the browser treat
 * it as `:defined`, so the ce-autoloader never tries to resolve it from a team catalog.
 */
class ViRouter extends HTMLElement { }

if (!customElements.get("vi-router")) {
    customElements.define("vi-router", ViRouter);
}

const stage = document.querySelector("vi-router");

/**
 * Says how the markup on screen was produced - see `./ribbon.ts`. It lives on `<body>`, outside
 * the stage, so re-rendering a route cannot take it with it.
 */
const showMode = createRibbon(document.body);

new CEAutoLoader({ catalog, devErrors: false, hooks: { error: console.error } });

/** The route this document was prerendered for, or null when it is a bare shell */
const marker = document.documentElement.getAttribute(PRERENDERED_ATTRIBUTE);
const path = location.pathname;

/**
 * The route this page was rendered from, written into the page by the SSG pass. It is a global
 * rather than an import, which is what keeps the shell free of every team's route table.
 */
const embeddedRoute = (globalThis as unknown as Record<string, Route | undefined>)[
    PRERENDERED_ROUTE_GLOBAL
];

/**
 * `/product/:id` against `/product/CL-01` -> `{ id: "CL-01" }`, or null.
 *
 * A deliberate copy of `router.ts`'s matcher, inlined so that the shell does not import the
 * router and drag it into the SSR bundle.
 */
function paramsFor(pattern: string, path: string): Record<string, string> | null {
    const keys: string[] = [];
    const source = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/:([A-Za-z_$][\w$]*)/g, (_, key: string) => (keys.push(key), "([^/]+)"));
    const values = new RegExp(`^${source}/?$`).exec(path);

    return values ? Object.fromEntries(keys.map((key, i) => [key, values[i + 1]])) : null;
}

if (marker === path && location.search && embeddedRoute) {
    const params = paramsFor(embeddedRoute.path, path);

    if (params) {
        const query = new URLSearchParams(location.search);

        stage.innerHTML = embeddedRoute.render(params, { name: embeddedRoute.name, path: embeddedRoute.path, params, query });
        showMode("spa");
    }
} else if (marker && marker !== path) {
    stage.innerHTML = "<h1>404 Not Found</h1>";
    showMode("spa");
} else if (marker === path) {
    showMode("ssg");
}
