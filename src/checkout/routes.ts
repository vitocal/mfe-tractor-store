import type { Route } from "../src/router.ts";

/**
 * Checkout team route table.
 *
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
        render: () => `<checkout-pages-checkout></checkout-pages-checkout>`,
    },

];

export default routes;
