import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";
import { tagsIn } from "./component-styles";

import { createRouter } from "./router";
import type { Router } from "./router";

import explore_routes from "@mfe-tractor/explore/routes"
import decide_routes from "@mfe-tractor/decide/routes";
import checkout_routes from "@mfe-tractor/checkout/routes";

import { PRERENDERED_ATTRIBUTE } from "./prerendered";

/**
 * The shell.
 *
 * It does two things, and which one matters depends on how the page was served:
 *
 * - **It boots the loader.** `ce-autoloader` upgrades whatever custom elements the markup
 *   holds. On a prerendered page that is the whole job.
 * - **It renders the route.** The router turns a url into the markup of the route that
 *   matches it. That is what produces a page in dev, and what serves the routes no pass
 *   prerenders - the decide and checkout pages - in a built site.
 *
 * Both live in one bundle because a prerendered page can link to a route that was never
 * prerendered, so the router has to be there even on a page where it renders nothing.
 *
 * Links are deliberately not intercepted: every explore page is prerendered, so a plain
 * document navigation lands on real markup, which is what the cross-document view transitions
 * in `index.html` are set up for. Only a page that drives navigation itself calls `navigate`
 * - the checkout page, after placing an order.
 */

/** The shell router, extended with client-side navigation so pages can drive it */
type ShellRouter = Router & { navigate: (path: string) => void };

/** The (still experimental) bits of the View Transitions API the shell uses */
type NavigationViewTransition = { waitUntil(promise: Promise<unknown>): void };

/**
 * The shell stage.
 *
 * `vi-router` is a plain, non-catalog custom element: registering it makes the
 * browser treat it as `:defined`, so the ce-autoloader never tries to resolve it
 * from a team catalog. It also keeps the stage and the router bound together,
 * so pages can navigate through `vi-router.router.navigate(path)`.
 */
class ViRouter extends HTMLElement {
    router?: ShellRouter;
}

if (!customElements.get("vi-router")) {
    customElements.define("vi-router", ViRouter);
}

const stage = document.querySelector('vi-router') as ViRouter;

/** The route this document was prerendered for, or null when it is a bare shell */
const prerenderedFor = document.documentElement.getAttribute(PRERENDERED_ATTRIBUTE);

function renderRoute() {
    const path = window.location.pathname;

    // A prerendered page is served with this route's markup already in the stage. Rendering
    // it again would throw that markup away and draw the same thing: a flash for the user,
    // and the prerender's work wasted. Everything else still goes through the router - a
    // route no pass prerenders, or a navigation a page drove itself.
    if (path === prerenderedFor && stage.firstElementChild) return;

    // The query is part of what a route renders - the decide page reads `?sku=` - so it goes
    // with the path.
    const result = window.router.render(path + window.location.search);

    stage.innerHTML = result?.html ?? "";
}

/** Client-side navigation: updates the url, scrolls to top and re-renders the active route */
function navigate(path: string) {
    window.history.pushState({}, "", path);
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderRoute();
}

function init() {
    const notFound = {
        name: "not-found",
        path: "*",
        render: () => `<h1>404 Not Found</h1>`
    };

    // Bind the stage and the router together, so pages reach the same router
    // through `vi-router.router` (and the shell through `window.router`).
    const router: ShellRouter = Object.assign(
        createRouter([...explore_routes, ...decide_routes, ...checkout_routes], { notFound }),
        { navigate },
    );
    stage.router = router;
    window.router = router;

    window.registry = new CEAutoLoader({ catalog, devErrors: false, hooks: { error: console.error } });

    // Cross-document view transitions: before the incoming page is snapshotted, wait for the
    // route's custom elements to upgrade, so the transition lands on real content, not skeletons.
    addEventListener("pagereveal", (event) => {
        const transition = (event as Event & { viewTransition?: NavigationViewTransition }).viewTransition;
        const tags = tagsIn(stage.innerHTML).filter((tag) => tag in catalog && !customElements.get(tag));

        if (!transition || !window.registry) return;
        if (!tags.length) return;

        transition.waitUntil(window.registry.preload(tags).catch(() => { }));
    });

    // Links are left to the browser on purpose - see the note at the top of this file. The
    // marker they carry (`data-navigo`) is still the app's "this is an app link" convention:
    // the playground routes on it, and it is what to match on if a page ever wants to navigate
    // client-side instead.
    window.addEventListener("popstate", renderRoute);

    renderRoute();
}

init();

declare global {
    interface Window {
        registry?: CEAutoLoader;
        router?: Router;
    }
}