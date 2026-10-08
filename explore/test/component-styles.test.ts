import assert from "node:assert/strict";
import FS from "node:fs";
import Path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import catalog from "../dist/catalog.js";
import {
  designSystemBuild,
  stylesByTag,
  stylesForTags,
  tagsIn,
  teamBuild,
  unknownTags,
  withStylesheets,
  withoutStylesheets,
} from "../../scripts/component-styles.ts";
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

/** A build with the interesting shapes in it: components, and modules that are not */
const demoBuild: ComponentBuild = teamBuild("demo", ".ce.tsx", {
  "pages/home.ce.tsx": { file: "chunks/home.ce.js", css: ["assets/home-abc.css"] },
  "components/header.ce.tsx": { file: "chunks/header.ce.js", css: ["assets/header-abc.css"] },
  "components/plain.ce.tsx": { file: "chunks/plain.ce.js" },
  "routes.ts": { file: "routes.js" },
  "chunks/shared.js": { file: "chunks/shared.js" },
});

describe("component styles", () => {
  describe("tagsIn", () => {
    it("lists the custom element tags once, in order", () => {
      const html = `<vi-router><explore-pages-home></explore-pages-home><explore-components-header/>`;

      assert.deepEqual(tagsIn(html), [
        "vi-router",
        "explore-pages-home",
        "explore-components-header",
      ]);
    });

    it("ignores plain elements", () => {
      assert.deepEqual(tagsIn(`<div class="a-b"><main></main></div>`), []);
    });
  });

  describe("teamBuild", () => {
    it("names a component the way its catalog does", () => {
      assert.equal(exploreBuild.tagFor("pages/category.ce.tsx"), "explore-pages-category");
      assert.equal(exploreBuild.tagFor("components/header.ce.tsx"), "explore-components-header");
    });

    it("has no tag for a module that is not a component", () => {
      assert.equal(exploreBuild.tagFor("routes.ts"), null);
      assert.equal(exploreBuild.tagFor("chunks/utils.js"), null);
    });
  });

  describe("designSystemBuild", () => {
    const shell = designSystemBuild({
      "src/components/button.tsx": { file: "chunks/button.js", css: ["assets/button-abc.css"] },
      "src/app.ts": { file: "index.js" },
      "src/catalog.ts": { file: "index.js" },
    });

    it("names a design system component after its file", () => {
      assert.equal(shell.tagFor("src/components/button.tsx"), "ds-button");
    });

    it("has no tag for anything else the shell emits", () => {
      assert.equal(shell.tagFor("src/app.ts"), null);
      assert.equal(shell.tagFor("src/catalog.ts"), null);
    });
  });

  describe("stylesByTag", () => {
    it("maps a component to the stylesheet its build emitted", () => {
      assert.deepEqual(stylesByTag([demoBuild]).get("demo-pages-home"), ["/demo/dist/assets/home-abc.css"]);
    });

    it("leaves out the modules that are not components", () => {
      assert.deepEqual([...stylesByTag([demoBuild]).keys()].sort(), [
        "demo-components-header",
        "demo-components-plain",
        "demo-pages-home",
      ]);
    });

    it("still lists a component that was compiled without a stylesheet", () => {
      assert.deepEqual(stylesByTag([demoBuild]).get("demo-components-plain"), []);
    });
  });

  describe("stylesForTags", () => {
    const index = new Map([
      ["explore-pages-home", ["/assets/home.css"]],
      ["explore-components-header", ["/assets/header.css"]],
      ["explore-components-plain", []],
    ]);

    it("collects the stylesheets of the tags the page uses", () => {
      assert.deepEqual(
        stylesForTags(index, ["explore-pages-home", "explore-components-header"]).urls,
        ["/assets/header.css", "/assets/home.css"],
      );
    });

    it("ignores a tag that is not a component of any build", () => {
      assert.deepEqual(stylesForTags(index, ["vi-router", "my-widget"]).urls, []);
    });

    it("reports a component whose build declares no stylesheet", () => {
      assert.deepEqual(stylesForTags(index, ["explore-components-plain"]), {
        urls: [],
        unstyled: ["explore-components-plain"],
      });
    });
  });

  describe("unknownTags", () => {
    const index = new Map([["explore-pages-home", []]]);

    it("flags a tag that names a build nothing declares", () => {
      assert.deepEqual(
        unknownTags(index, ["checkout-components-minicart"], ["explore", "checkout"]),
        ["checkout-components-minicart"],
      );
    });

    it("leaves tags outside every namespace alone", () => {
      assert.deepEqual(unknownTags(index, ["vi-router", "model-viewer"], ["explore", "checkout"]), []);
    });
  });

  describe("withStylesheets", () => {
    it("appends the links to the head, after the shell's own styles", () => {
      const html = `<head><link rel="stylesheet" href="/assets/shell.css"></head><body></body>`;

      assert.equal(
        withStylesheets(html, ["/assets/home.css"]),
        `<head><link rel="stylesheet" href="/assets/shell.css">` +
          `<!-- component styles --><link rel="stylesheet" href="/assets/home.css"></head><body></body>`,
      );
    });

    it("leaves the page untouched when there is nothing to link", () => {
      const html = `<head></head><body></body>`;

      assert.equal(withStylesheets(html, []), html);
    });
  });

  describe("withoutStylesheets", () => {
    it("gives back the page the build wrote, so a rerun starts clean", () => {
      const shell = `<head><link rel="stylesheet" href="/assets/shell.css"></head><body></body>`;

      assert.equal(withoutStylesheets(withStylesheets(shell, ["/assets/home.css"])), shell);
    });

    it("leaves a page that never had the block alone", () => {
      const shell = `<head><link rel="stylesheet" href="/assets/shell.css"></head><body></body>`;

      assert.equal(withoutStylesheets(shell), shell);
    });
  });

  describe("the built catalog", () => {
    it("agrees with the manifest, so a rename can not silently drop the styles", () => {
      const index = stylesByTag([exploreBuild]);
      const declared = Object.keys(catalog);

      assert.ok(declared.length > 0, "the built catalog is empty");

      for (const tag of declared) {
        assert.ok(index.has(tag), `<${tag}> is in the catalog but not in the manifest index`);
      }
    });

    it("resolves every component to a stylesheet", () => {
      const index = stylesByTag([exploreBuild]);

      for (const tag of Object.keys(catalog)) {
        assert.ok(index.get(tag)?.length, `<${tag}> is in the catalog but has no stylesheet`);
      }
    });
  });
});
