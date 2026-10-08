import assert from "node:assert/strict";
import FS from "node:fs/promises";
import OS from "node:os";
import Path from "node:path";
import { describe, it } from "node:test";

import { checkFingerprinted, headersFile, isFingerprinted, ruleFor } from "../../scripts/cache-headers.ts";
import { TEAMS } from "../../scripts/ssg-teams.ts";
import { CACHE } from "../../vite.config.js";

/**
 * What the site promises a browser it may keep, read from the config the build actually uses.
 *
 * The interesting half of a caching policy is the half it does not list, so most of what is here is
 * about the paths that have to be revalidated: a catalog, a route table, a page of html.
 */

/** The headers, spelled out: a test that read them from the config could not notice them changing. */
const YEAR = "public, max-age=31536000, immutable";
const HOUR = "public, max-age=3600";

/** A throwaway output directory holding `files` */
async function outputWith(files: string[]): Promise<string> {
  const dir = await FS.mkdtemp(Path.join(OS.tmpdir(), "cache-headers-"));

  for (const file of files) {
    await FS.mkdir(Path.dirname(Path.join(dir, file)), { recursive: true });
    await FS.writeFile(Path.join(dir, file), "");
  }

  return dir;
}

describe("cache headers", () => {
  describe("the config's rules", () => {
    it("caches a fingerprinted directory forever", () => {
      for (const path of [
        "/assets/index-Sr_q2wP2.css",
        "/chunks/home.ce-Bc_P_DP6.js",
        "/entries/index-7lafZk2J.js",
        ...TEAMS.map((team) => `/${team.name}/dist/chunks/category.ce-CLRlvlHp.js`),
      ]) {
        assert.equal(ruleFor(CACHE.rules, path)?.cache, YEAR, path);
      }
    });

    it("gives a release pointer an hour, not forever", () => {
      for (const path of [
        "/catalog.js",
        "/cdn/js/helper.js",
        "/cdn/img/logo.svg",
        "/robots.txt",
        "/llms.txt",
        ...TEAMS.flatMap((team) => [`/${team.name}/dist/catalog.js`, `/${team.name}/dist/routes.js`]),
      ]) {
        assert.equal(ruleFor(CACHE.rules, path)?.cache, HOUR, path);
      }
    });

    it("leaves a page to the page rule", () => {
      for (const path of ["/", "/products", "/product/AU-01", "/checkout/cart", "/products.html"]) {
        assert.equal(ruleFor(CACHE.rules, path), undefined, path);
      }
    });
  });

  describe("isFingerprinted", () => {
    it("recognises a chunk, a stylesheet and the map of either", () => {
      for (const file of ["category-LUucyYPK.css", "button-BIzQie78.js", "button-BIzQie78.js.map"]) {
        assert.equal(isFingerprinted(file), true, file);
      }
    });

    it("rejects the names that stay put", () => {
      for (const file of ["button.js", "catalog.js", "routes.js", "helper.js", "index.html"]) {
        assert.equal(isFingerprinted(file), false, file);
      }
    });
  });

  describe("checkFingerprinted", () => {
    it("passes the output it vouches for", async () => {
      const dir = await outputWith(["assets/index-Sr_q2wP2.css", "chunks/home.ce-Bc_P_DP6.js"]);

      try {
        assert.deepEqual((await checkFingerprinted(dir, CACHE.rules)).sort(), [
          "assets/index-Sr_q2wP2.css",
          "chunks/home.ce-Bc_P_DP6.js",
        ]);
      } finally {
        await FS.rm(dir, { recursive: true, force: true });
      }
    });

    it("fails the build when a directory it calls cacheable stops hashing", async () => {
      const dir = await outputWith(["chunks/home.ce.js"]);

      try {
        await assert.rejects(checkFingerprinted(dir, CACHE.rules), /carries no content hash/);
      } finally {
        await FS.rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("headersFile", () => {
    it("writes the rules and the pages, and no catch-all", () => {
      const file = headersFile(["/", "/products"], CACHE);

      for (const rule of CACHE.rules) assert.ok(file.includes(`${rule.path}\n  Cache-Control: ${rule.cache}`), rule.path);

      assert.ok(file.includes(`/products\n  Cache-Control: ${CACHE.page}`));
      assert.ok(!/^\/\*$/m.test(file));
    });
  });
});
