import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";

import { createRouter } from "./router";
import type { Router } from "./router";

import explore_routes from "@mfe-tractor/explore/routes"
import decide_routes from "@mfe-tractor/decide/routes";
import checkout_routes from "@mfe-tractor/checkout/routes";

/** The shell stage. Also exposes the navigation API teams call as `vi-router.router.navigate(path)` */
const stage = document.querySelector('vi-router') as Element & { router?: { navigate: (path: string) => void } };
const useHash = true;

function renderRoute() {
    // URL: http://localhost:4001/products/classic -> render callback of "products-by-category"
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

    window.router = createRouter([...explore_routes, ...decide_routes, ...checkout_routes], { notFound });
    window.registry = new CEAutoLoader({ catalog, devErrors: false, hooks: { error: console.error } });

    // Pages trigger client-side navigation through the shell stage (eg: checkout pages)
    stage.router = { navigate };

    // Intercept app links (data-navigo), navigating client-side like the shell app
    // `data-navigo` may live on a wrapper custom-element (eg: <ds-button href data-navigo>),
    // so match any element that carries both the marker and an href.
    stage.addEventListener("click", (event) => {
        const link = event.target instanceof Element && event.target.closest("a[data-navigo], [data-navigo][href]");
        if (!link) return;

        const url = new URL(link.getAttribute("href"), window.location.href);
        if (url.origin !== window.location.origin) return;

        event.preventDefault();
        navigate(url.pathname + url.search);
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