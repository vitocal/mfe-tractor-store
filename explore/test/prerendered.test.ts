import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  markPrerendered,
  prerenderedRoute,
  PRERENDERED_ATTRIBUTE,
} from "../../scripts/prerendered.ts";

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
