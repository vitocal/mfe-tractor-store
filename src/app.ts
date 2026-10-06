import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";

import { createRouter } from "./router";
import type { Router } from "./router";

import explore_routes from "@mfe-tractor/explore/routes"
import decide_routes from "@mfe-tractor/decide/routes";
import checkout_routes from "./checkout/routes";

const routes = [
    ...explore_routes,
    ...decide_routes,
    ...checkout_routes,
]
console.log(routes);

const stage = document.querySelector('vi-router');
const useHash = true;

function renderRoute() {
    console.log(window.location.search);
    // URL: http://localhost:4001/products/classic -> render callback of "products-by-category"
    const result = window.router.render(window.location.pathname + window.location.search);
    const match = result?.match;

    stage.innerHTML = result?.html ?? "";
}


function init() {
    const notFound = {
        name: "not-found",
        path: "*",
        render: () => `<h1>404 Not Found</h1>`
    };

    window.router = createRouter([...explore_routes, ...decide_routes, ...checkout_routes], { notFound });
    window.registry = new CEAutoLoader({ catalog, devErrors: false, hooks: { error: console.error } });

    // Intercept app links (data-navigo), navigating client-side like the shell app
    stage.addEventListener("click", (event) => {
        const link = event.target instanceof Element && event.target.closest("a[data-navigo]");
        if (!link) return;

        const url = new URL(link.getAttribute("href"), window.location.href);
        if (url.origin !== window.location.origin) return;

        console.log(url);
        event.preventDefault();
        window.history.pushState({}, "", url);
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderRoute();
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