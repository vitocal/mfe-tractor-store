import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";
import { createRibbon } from "./ribbon";
import { tagsIn } from "./tags";

import { createRouter } from "./router";
import type { Router } from "./router";

import routes from "./routes";

// The marker a prerendered page carries. Written by the SSG pass, so it lives with the
// tooling - see `scripts/prerendered.ts` for the other half of the contract.
import { PRERENDERED_ATTRIBUTE } from "../scripts/prerendered";

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

/**
 * Says how the markup on screen was produced - see `./ribbon.ts`. It lives on `<body>`, outside
 * the stage, so re-rendering a route cannot take it with it.
 */
const showMode = createRibbon(document.body);

/** The route this document was prerendered for, or null when it is a bare shell */
const prerenderedFor = document.documentElement.getAttribute(PRERENDERED_ATTRIBUTE);

function renderRoute() {
    const url = window.location.pathname + window.location.search;

    // A prerendered page is served with this route's markup already in the stage, so rendering
    // it again would throw that markup away and draw the same thing: a flash for the user, and
    // the prerender's work wasted. The marker holds the url the pass rendered, so a query string
    // makes the two differ - on purpose, because a route may render differently for one (the
    // decide page picks its variant from `?sku=`).
    if (url === prerenderedFor && stage.firstElementChild) {
        showMode("ssg");
        return;
    }

    const result = window.router.render(url);

    stage.innerHTML = result?.html ?? "";
    showMode("spa");
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
        createRouter(routes, { notFound }),
        { navigate },
    );
    stage.router = router;
    window.router = router;

    window.registry = new CEAutoLoader({ catalog, devErrors: false, hooks: { error: console.error } });

    // Cross-document view transitions: before the incoming page is snapshotted, wait for the
    // route's custom elements to upgrade, so the transition lands on real content, not skeletons.
    // addEventListener("pagereveal", (event) => {
    //     const transition = (event as Event & { viewTransition?: NavigationViewTransition }).viewTransition;
    //     const tags = tagsIn(stage.innerHTML).filter((tag) => tag in catalog && !customElements.get(tag));

    //     if (!transition || !window.registry) return;
    //     if (!tags.length) return;

    //     transition.waitUntil(window.registry.preload(tags).catch(() => { }));
    // });

    // Links are left to the browser on purpose - see the note at the top of this file. The
    // marker they carry (`data-navigo`) is still the app's "this is an app link" convention:
    // the playground routes on it, and it is what to match on if a page ever wants to navigate
    // client-side instead.
    // window.addEventListener("popstate", renderRoute);

    renderRoute();
}

init();

declare global {
    interface Window {
        registry?: CEAutoLoader;
        router?: Router;
    }
}