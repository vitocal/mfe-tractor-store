import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Route } from "../../src/router.ts";
import routes from "../dist/routes.js";
import { fillStage, outputFileFor, pathsFor, withExplicitHead } from "../ssg.ts";

/** A throwaway route, only its path matters here */
function route(path: string): Route {
  return { name: "test", path, render: () => "" };
}

describe("ssg", () => {
  describe("pathsFor", () => {
    it("keeps a pattern without params as a single path", () => {
      assert.deepEqual(pathsFor(route("/products")), ["/products"]);
    });

    it("expands a param into one path per known value", () => {
      assert.deepEqual(pathsFor(route("/products/:category")), [
        "/products/classic",
        "/products/autonomous",
      ]);
    });

    it("turns the explore route table into one path per page", () => {
      assert.deepEqual((routes as Route[]).flatMap(pathsFor), [
        "/",
        "/products",
        "/products/classic",
        "/products/autonomous",
        "/stores",
      ]);
    });
  });

  describe("outputFileFor", () => {
    it("writes the root route as index.html", () => {
      assert.equal(outputFileFor("/"), "index.html");
    });

    it("mirrors the route path into nested directories", () => {
      assert.equal(outputFileFor("/products"), "products/index.html");
      assert.equal(outputFileFor("/products/classic"), "products/classic/index.html");
    });
  });

  describe("fillStage", () => {
    const template = `<body><vi-router class="tractor-app"></vi-router></body>`;

    it("puts the route markup inside the stage", () => {
      assert.equal(
        fillStage(template, "<explore-pages-home></explore-pages-home>"),
        `<body><vi-router class="tractor-app"><explore-pages-home></explore-pages-home></vi-router></body>`,
      );
    });

    it("replaces whatever the stage already holds, so a rerun is idempotent", () => {
      const filled = fillStage(template, "<explore-pages-home></explore-pages-home>");

      // A second pass starts from the file the first pass wrote
      assert.equal(fillStage(filled, "<explore-pages-home></explore-pages-home>"), filled);
      assert.equal(fillStage(filled, "<explore-pages-stores></explore-pages-stores>"), fillStage(template, "<explore-pages-stores></explore-pages-stores>"));
    });
  });

  describe("withExplicitHead", () => {
    it("adds the head the shell leaves implicit", () => {
      assert.equal(
        withExplicitHead(`<html lang="en">\n<meta charset="UTF-8">`),
        `<html lang="en">\n<head>\n<meta charset="UTF-8">`,
      );
    });

    it("leaves an explicit head alone", () => {
      const template = `<html><head><title>t</title></head><body></body></html>`;

      assert.equal(withExplicitHead(template), template);
    });
  });
});
