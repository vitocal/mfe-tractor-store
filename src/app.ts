import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";
import { tagsIn } from "./component-styles";

import { createRouter } from "./router";
import type { Router } from "./router";

import explore_routes from "@mfe-tractor/explore/routes"
import decide_routes from "@mfe-tractor/decide/routes";
import checkout_routes from "@mfe-tractor/checkout/routes";

console.log("[shell] module loaded", location.pathname);

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
const useHash = true;

function renderRoute() {
    // URL: http://localhost:4001/products/:id?search=1
    const result = window.router.render(window.location.pathname + window.location.search);

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
        console.log("[pagereveal] vt=", !!transition, "tags=", tags, "registry=", !!window.registry);

        if (!transition || !window.registry) return;
        if (!tags.length) return;

        transition.waitUntil(window.registry.preload(tags).catch(() => { }));
    });

    // Intercept app links (data-navigo), navigating client-side like the shell app
    // `data-navigo` may live on a wrapper custom-element (eg: <ds-button href data-navigo>),
    // so match any element that carries both the marker and an href.
    stage.addEventListener("click", (event) => {
        const link = event.target instanceof Element && event.target.closest("a[data-navigo], [data-navigo][href]");
        if (!link) return;

        const url = new URL(link.getAttribute("href"), window.location.href);
        if (url.origin !== window.location.origin) return;

        // event.preventDefault();
        // navigate(url.pathname + url.search);
    });
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