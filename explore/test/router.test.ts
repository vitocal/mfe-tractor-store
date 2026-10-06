import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRouter } from "../../src/router.ts";
import type { Route } from "../../src/router.ts";
import { normalizePath } from "../../src/router.ts";

import routes from "../dist/routes.js";

/**
 * The router lives in the shell (`src/router.ts`) and has no test runner of its own. It is
 * covered here because it is what the SSG routes with - see `../ssg.ts` - and because the
 * prerendered pages depend on it resolving the directory index.
 */
describe("router", () => {
  describe("normalizePath", () => {
    it("resolves the directory index a static build writes", () => {
      assert.equal(normalizePath("/index.html"), "/");
      assert.equal(normalizePath("/products/index.html"), "/products");
      assert.equal(normalizePath("/products/classic/index.html"), "/products/classic");
    });

    it("drops trailing slashes and the query", () => {
      assert.equal(normalizePath("/"), "/");
      assert.equal(normalizePath("/products/"), "/products");
      assert.equal(normalizePath("/products/classic/?sku=1"), "/products/classic");
    });
  });

  describe("matching prerendered urls", () => {
    const router = createRouter(routes as Route[]);

    it("routes /products/index.html to the products route, not to :category", () => {
      const match = router.match("/products/index.html");

      assert.equal(match?.name, "products");
      assert.deepEqual(match?.params, {});
    });

    it("routes /products/classic/index.html to the category route", () => {
      const match = router.match("/products/classic/index.html");

      assert.equal(match?.name, "products-by-category");
      assert.equal(match?.params.category, "classic");
    });
  });
});
