import type { Route } from "../src/router.ts";

/**
 * Explore team route table.
 *
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
