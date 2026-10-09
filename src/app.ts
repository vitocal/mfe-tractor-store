import CEAutoLoader from "ce-autoloader";
import { catalog } from "./catalog";

import type { RenderMode } from "./components/ribbon";
import type { Route } from "./router";

import { PRERENDERED_ATTRIBUTE, PRERENDERED_ROUTE_GLOBAL } from "../scripts/prerendered";

/**
 * The shell.
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
 * Says how the markup on screen was produced - see `./components/ribbon.ts`. The ribbon is the shell's own
 * custom element (`<render-mode>`), carried by `index.html` outside the stage, so re-rendering a
 * route cannot take it with it. Only the shell knows the mode, so it sets the element's `mode`.
 */
function showMode(mode: RenderMode): void {
    document.querySelector("render-mode")?.setAttribute("mode", mode);
}

/**
 * The teams' catalogs, asked for as soon as this module runs.
 *
 * The fetch is deliberately not awaited here: `index.html` loads this script render-blocking, the
 * markup is in the html already, and a script that waited for the teams would hold the first paint
 * for them. Asking now and awaiting later is what lets the fetch overlap whatever the branch below
 * does first - on a prerendered page that is the incoming view transition, which the upgrade has
 * to wait for anyway, so the teams arrive *during* the fade rather than after it.
 */
const catalogs = catalog();

/**
 * The shell's loader, built once the teams' catalogs have arrived.
 *
 * `ce-autoloader` resolves a tag once: a tag it does not know is left in the document untouched,
 * never retried. A prerendered page already holds every element by the time this runs, so the
 * catalog has to be complete *before* the loader exists.
 *
 * The loader picks up whatever is in the document when it is built, so the routing below may run
 * before or after it.
 */
async function load(): Promise<void> {
    window.registry = new CEAutoLoader({ catalog: await catalogs, devErrors: false, hooks: { error: console.error } });
}

/** The `pagereveal` event, as far as the shell cares: the transition it announces, if any */
type PageReveal = Event & { viewTransition: ViewTransition | null };

/**
 * Resolves once the incoming cross-document view transition, if there is one, has finished.
 *
 * A prerendered page arrives with its markup already in the document, so the loader's whole job is
 * to upgrade it - and every framework here mounts *over* that markup rather than hydrating it.
 * Replacing an element a transition captured aborts the whole transition, silently, a few frames
 * in - see `public/cdn/js/cls-tracker.js`, which reports exactly that and nothing else does. So
 * the upgrade waits for the fade it would otherwise cut short, and the visitor sees the page
 * arrive as one thing instead of a page that moves under them.
 *
 * `pagereveal` is where the incoming document learns it is being transitioned, and it is the last
 * event a module script can still catch: it fires after `load`, and this module runs before
 * `DOMContentLoaded`. A reveal with no transition - a first load, a reload, a browser that does
 * not do them - carries no `viewTransition`, so this resolves immediately.
 */
function transitionFinished(): Promise<void> {
    /** `finished` rejects when a transition is skipped or aborted, which is not a failure here. */
    const settle = (vt: ViewTransition | null): Promise<void> | null =>
        vt ? vt.finished.then(() => undefined, () => undefined) : null;

    // A reveal this module missed leaves the transition on the document instead of in an event.
    const running = settle(document.activeViewTransition);
    if (running) return running;

    return new Promise((resolve) => {
        addEventListener(
            "pagereveal",
            (event) => resolve(settle((event as PageReveal).viewTransition) ?? undefined),
            { once: true },
        );
    });
}


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
    // The page is pre-rendered but have queryParams,
    // so it needs to run in the client again()
    await load();

    const params = paramsFor(embeddedRoute.path, path);
    if (params) {
        const query = new URLSearchParams(location.search);

        stage.innerHTML = embeddedRoute.render(params, { name: embeddedRoute.name, path: embeddedRoute.path, params, query });
        showMode("client");
    }
} else if (marker === path) {
    // pre-rendered: the markup is already here, so the loader's whole job is to upgrade it - and
    // it does that after the incoming transition, which upgrading would abort. See
    // `transitionFinished`.
    await transitionFinished();
    await load();
    showMode("server");
} else if (marker && marker !== path) {
    await load();
    stage.innerHTML = "<h1>404 Not Found</h1>";
    showMode("client");
} else {
    await load();
    showMode("client")
}