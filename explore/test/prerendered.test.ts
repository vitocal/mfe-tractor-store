import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  markPrerendered,
  prerenderedRoute,
  PRERENDERED_ATTRIBUTE,
  embedRoute,
  withRoute,
  withoutRoute,
  PRERENDERED_ROUTE_GLOBAL,
} from "../../scripts/prerendered.ts";
import type { Route } from "../../src/router.ts";

describe("prerendered marker", () => {
  /** The shell as the build writes it: no head element, no marker */
  const shell = `<html lang="en" data-appear="true">\n<head></head><body></body></html>`;

  describe("markPrerendered", () => {
    it("records the route on the html element", () => {
      assert.equal(
        markPrerendered(shell, "/products/classic"),
        `<html lang="en" data-appear="true" ${PRERENDERED_ATTRIBUTE}="/products/classic">` +
          `\n<head></head><body></body></html>`,
      );
    });

    it("replaces the marker a previous run left, so a rerun can not stack two", () => {
      const twice = markPrerendered(markPrerendered(shell, "/stores"), "/products");

      assert.equal(twice, markPrerendered(shell, "/products"));
      assert.equal(twice.match(/data-prerendered/g)?.length, 1);
    });
  });

  describe("prerenderedRoute", () => {
    it("reads back the route the page was rendered for", () => {
      assert.equal(prerenderedRoute(markPrerendered(shell, "/stores")), "/stores");
    });

    it("reports nothing for a bare shell", () => {
      assert.equal(prerenderedRoute(shell), null);
    });
  });
});

describe("prerendered route", () => {
  const shell = `<html lang="en">\n<head></head><body></body></html>`;

  /** A route like the ones a team's table holds: a pure string builder */
  const route: Route = {
    name: "decide-pages-product",
    path: "/product/:id",
    render: (params, match) => {
      const sku = match?.query.get("sku");

      return `<decide-pages-product id="${params.id}"${sku ? ` sku="${sku}"` : ""}></decide-pages-product>`;
    },
  };

  describe("embedRoute", () => {
    it("writes the route onto a global, the render as source", () => {
      const script = embedRoute(route);

      assert.ok(script.startsWith(`<script>globalThis.${PRERENDERED_ROUTE_GLOBAL}=`));
      assert.ok(script.endsWith("</script>"));
      assert.ok(script.includes(`name:"${route.name}"`));
      assert.ok(script.includes(`path:"${route.path}"`));
    });

    it("round-trips: the embedded render produces the same html", () => {
      const source = embedRoute(route).slice("<script>".length, -"</script>".length);
      const sandbox: Record<string, unknown> = {};

      new Function("globalThis", source)(sandbox);

      const embedded = sandbox[PRERENDERED_ROUTE_GLOBAL] as Route;
      const match = {
        name: route.name,
        path: route.path,
        params: { id: "CL-01" },
        query: new URLSearchParams("sku=CL-01-GY"),
      };

      assert.equal(embedded.render({ id: "CL-01" }, match), route.render({ id: "CL-01" }, match));
    });
  });

  describe("withRoute / withoutRoute", () => {
    it("adds the route script to the head", () => {
      const page = withRoute(shell, route);

      assert.ok(page.includes(embedRoute(route)));
      assert.ok(page.indexOf(embedRoute(route)) < page.indexOf("</head>"));
    });

    it("removes it again, so the shell template stays pristine", () => {
      assert.equal(withoutRoute(withRoute(shell, route)), shell);
    });

    it("leaves html without a route block untouched", () => {
      assert.equal(withoutRoute(shell), shell);
    });
  });
});
