import type { Route } from "../src/router.ts";

/**
 * Team Decide route table.
 *
 * The playground, the dev server (spa fallback) and the shell app all read the
 * routes from here, so paths and callbacks stay in a single place.
 * Every route has a `name`, a readable `path` (with optional `:params`) and a
 * `render` callback that receives the parameters and returns the page html.
 */

export const routes: Route[] = [
  {
    name: "decide-pages-product",
    path: "/product/:id",
    render: (params, match) => {
      const { id } = params;
      const sku = match?.query.get("sku");

      // The sku is optional and decides which variant renders, so it is only set when the url
      // carries one.
      const attributes = sku ? `id="${id}" sku="${sku}"` : `id="${id}"`;

      return `<decide-pages-product ${attributes}></decide-pages-product>`;
    },
  },
];

export default routes;
