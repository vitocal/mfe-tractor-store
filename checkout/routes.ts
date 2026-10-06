import type { Route } from "../src/router.ts";

/**
 * Checkout team route table.
 *
 * The dev server (spa fallback) and the shell app all read the routes from
 * here, so paths and callbacks stay in a single place.
 * Every route has a `name`, a readable `path` and a `render` callback that
 * returns the page html.
 */
export const routes: Route[] = [
    {
        name: "checkout-cart",
        path: "/checkout/cart",
        render: () => `<checkout-pages-cart></checkout-pages-cart>`,
    },
    {
        name: "checkout-checkout",
        path: "/checkout/checkout",
        render: () => `<checkout-pages-checkout></checkout-pages-checkout>`,
    },
    {
        name: "checkout-thanks",
        path: "/checkout/thanks",
        render: () => `<checkout-pages-thanks></checkout-pages-thanks>`,
    },
];

export default routes;
