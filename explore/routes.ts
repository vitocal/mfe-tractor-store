import type { Route } from "../src/router.ts";

/**
 * Explore team route table.
 *
 * The playground, the dev server (spa fallback) and the shell app all read the
 * routes from here, so paths and callbacks stay in a single place.
 * Every route has a `name`, a readable `path` (with optional `:params`) and a
 * `render` callback that receives the parameters and returns the page html.
 */
export const routes: Route[] = [
  {
    name: "home",
    path: "/",
    render: () => `<explore-pages-home></explore-pages-home>`,
  },
  {
    name: "products",
    path: "/products",
    render: () => `<explore-pages-category></explore-pages-category>`,
  },
  {
    name: "products-by-category",
    path: "/products/:category",
    render: ({ category }) => `<explore-pages-category category="${category}"></explore-pages-category>`,
  },
  {
    name: "stores",
    path: "/stores",
    render: () => `<explore-pages-stores></explore-pages-stores>`,
  },
];

export default routes;
