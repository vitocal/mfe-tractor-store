import assert from "node:assert/strict";
import FS from "node:fs";
import Path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import catalog from "../dist/catalog.js";
import {
  chunksByTag,
  chunksForTags,
  withModulePreloads,
  withoutModulePreloads,
} from "../../scripts/component-chunks.ts";
import { teamBuild } from "../../scripts/component-styles.ts";
import type { ComponentBuild, Manifest } from "../../scripts/component-styles.ts";

/** The team's own build, which the test script runs first */
const TEAM_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");

const exploreBuild: ComponentBuild = teamBuild(
  "explore",
  ".ce.tsx",
  JSON.parse(
    FS.readFileSync(Path.join(TEAM_DIR, "dist", ".vite", "manifest.json"), "utf8"),
  ) as Manifest,
);

/**
 * A build with the shapes that matter: a component that imports a shared chunk, a component that
 * imports nothing, and a component whose chunk the shared chunk also reaches.
 */
const demoBuild: ComponentBuild = teamBuild("demo", ".ce.tsx", {
  "pages/home.ce.tsx": { file: "chunks/home.ce.js", imports: ["_shared-abc.js"] },
  "components/header.ce.tsx": { file: "chunks/header.ce.js" },
  "components/plain.ce.tsx": { file: "chunks/plain.ce.js" },
  "routes.ts": { file: "routes.js" },
  "_shared-abc.js": { file: "chunks/shared-abc.js", imports: ["_runtime-def.js"] },
  "_runtime-def.js": { file: "chunks/runtime-def.js" },
});

describe("component chunks", () => {
  describe("chunksByTag", () => {
    it("gives a tag its own chunk, then what that chunk imports", () => {
      assert.deepEqual(chunksByTag([demoBuild]).get("demo-pages-home"), [
        "/demo/dist/chunks/home.ce.js",
        "/demo/dist/chunks/shared-abc.js",
        "/demo/dist/chunks/runtime-def.js",
      ]);
    });

    it("gives a tag with no imports its chunk alone", () => {
      assert.deepEqual(chunksByTag([demoBuild]).get("demo-components-header"), [
        "/demo/dist/chunks/header.ce.js",
      ]);
    });

    it("leaves out the modules that are not components", () => {
      assert.deepEqual([...chunksByTag([demoBuild]).keys()].sort(), [
        "demo-components-header",
        "demo-components-plain",
        "demo-pages-home",
      ]);
    });

    it("does not follow a dynamic import, which is the component's own business", () => {
      const build: ComponentBuild = teamBuild("demo", ".ce.tsx", {
        "pages/home.ce.tsx": {
          file: "chunks/home.ce.js",
          dynamicImports: ["components/lazy.ce.tsx"],
        },
        "components/lazy.ce.tsx": { file: "chunks/lazy.ce.js" },
      });

      assert.deepEqual(chunksByTag([build]).get("demo-pages-home"), ["/demo/dist/chunks/home.ce.js"]);
    });
  });

  describe("chunksForTags", () => {
    const index = new Map([
      ["explore-pages-home", ["/assets/home.js", "/assets/shared.js"]],
      ["explore-components-header", ["/assets/header.js", "/assets/shared.js"]],
    ]);

    it("collects the javascript of the tags the page uses, each file once", () => {
      assert.deepEqual(
        chunksForTags(index, ["explore-pages-home", "explore-components-header"]),
        ["/assets/header.js", "/assets/home.js", "/assets/shared.js"],
      );
    });

    it("ignores a tag that is not a component of any build", () => {
      assert.deepEqual(chunksForTags(index, ["vi-router", "my-widget"]), []);
    });
  });

  describe("withModulePreloads", () => {
    it("appends the links to the head, after the shell's own", () => {
      const html = `<head><script type="module" src="/entries/index.js"></script></head><body></body>`;

      assert.equal(
        withModulePreloads(html, ["/chunks/home.ce.js"]),
        `<head><script type="module" src="/entries/index.js"></script>` +
          `<!-- component chunks --><link rel="modulepreload" href="/chunks/home.ce.js"></head><body></body>`,
      );
    });

    it("leaves the page untouched when there is nothing to preload", () => {
      const html = `<head></head><body></body>`;

      assert.equal(withModulePreloads(html, []), html);
    });
  });

  describe("withoutModulePreloads", () => {
    it("gives back the page the build wrote, so a rerun starts clean", () => {
      const shell = `<head><link rel="stylesheet" href="/assets/shell.css"></head><body></body>`;

      assert.equal(withoutModulePreloads(withModulePreloads(shell, ["/chunks/home.ce.js"])), shell);
    });

    it("leaves a page that never had the block alone", () => {
      const shell = `<head><link rel="stylesheet" href="/assets/shell.css"></head><body></body>`;

      assert.equal(withoutModulePreloads(shell), shell);
    });
  });

  describe("the built catalog", () => {
    const index = chunksByTag([exploreBuild]);

    it("agrees with the manifest, so a rename can not silently drop the preload", () => {
      for (const tag of Object.keys(catalog)) {
        assert.ok(index.has(tag), `<${tag}> is in the catalog but not in the manifest index`);
      }
    });

    it("names files the build actually wrote", () => {
      for (const [tag, urls] of index) {
        for (const url of urls) {
          const file = Path.join(TEAM_DIR, "dist", url.replace(/^\/explore\/dist\//, ""));

          assert.ok(FS.existsSync(file), `${tag} preloads ${url}, which is not on disk`);
        }
      }
    });
  });
});
