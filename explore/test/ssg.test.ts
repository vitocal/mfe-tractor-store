import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Route } from "../../src/router.ts";
import { TEAMS } from "../../scripts/ssg-teams.ts";
import { fillStage, outputFileFor, pathsFor, withExplicitHead } from "../../scripts/ssg.ts";

import routes from "../dist/routes.js";

/** A throwaway route, only its path matters here */
function route(path: string): Route {
  return { name: "test", path, render: () => "" };
}

/** The categories the explore database holds, which is what the pass enumerates a param with */
const CATEGORIES = { category: ["classic", "autonomous"] };

describe("ssg", () => {
  describe("pathsFor", () => {
    it("keeps a pattern without params as a single path", () => {
      assert.deepEqual(pathsFor(route("/products")), ["/products"]);
    });

    it("expands a param into one path per known value", () => {
      assert.deepEqual(pathsFor(route("/products/:category"), CATEGORIES), [
        "/products/classic",
        "/products/autonomous",
      ]);
    });

    it("drops a pattern whose param has no known values", () => {
      assert.deepEqual(pathsFor(route("/products/:category")), []);
    });

    it("turns the explore route table into one path per page", async () => {
      const explore = TEAMS.find(({ name }) => name === "explore");

      assert.ok(explore, "explore is one of the teams the pass covers");

      const paths = (routes as Route[]).flatMap((route) => pathsFor(route, CATEGORIES));

      assert.deepEqual(paths, [
        "/",
        "/products",
        "/products/classic",
        "/products/autonomous",
        "/stores",
      ]);
      assert.deepEqual(await explore.params(), CATEGORIES);
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
