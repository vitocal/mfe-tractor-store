import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ceRenderToString,
  renderable,
  splitMixedImports,
  stylesFor,
} from "../../scripts/ce-render.ts";
import type { Catalog } from "../../scripts/ce-render.ts";
import type { Manifest } from "../../scripts/component-styles.ts";

// Explore's preset: the built catalog, the build manifest, and a renderer that uses both, the same
// way `./render.ts` binds them for the page suite.
import { catalog, manifest, render } from "./render.ts";

/** A build with the interesting shapes in it: components, and modules that are not */
const demoManifest: Manifest = {
  "pages/home.ce.tsx": { file: "chunks/home.ce.js", css: ["assets/home-abc.css"] },
  "components/header.ce.tsx": { file: "chunks/header.ce.js", css: ["assets/header-abc.css"] },
  "components/plain.ce.tsx": { file: "chunks/plain.ce.js" },
  "routes.ts": { file: "routes.js" },
};

/** A catalog of urls: `stylesFor` only reads the tags, so the loaders are never called */
const demoCatalog: Catalog = {
  "demo-pages-home": "/demo/chunks/home.ce.js",
  "demo-components-header": "/demo/chunks/header.ce.js",
  "demo-components-plain": "/demo/chunks/plain.ce.js",
};

describe("ce render", () => {
  describe("splitMixedImports", () => {
    it("splits a default import and named imports into two statements", () => {
      assert.equal(
        splitMixedImports(`import{ce}from"./a.js";import Upgraded,{upgradedProps}from"./b.js";`),
        `import{ce}from"./a.js";import Upgraded from "./b.js";import{upgradedProps}from"./b.js";`,
      );
    });

    it("leaves a statement that only imports one of the two alone", () => {
      const source = `import{ce}from"./a.js";import Upgraded from"./b.js";`;

      assert.equal(splitMixedImports(source), source);
    });
  });

  describe("renderable", () => {
    it("empties the dependency list a preload helper is called with", () => {
      const loader = `()=>n(()=>import(\`./chunks/home.ce.js\`),__vite__mapDeps([5,3,4]),import.meta.url)`;

      assert.equal(
        renderable(loader),
        `()=>n(()=>import(\`./chunks/home.ce.js\`),[],import.meta.url)`,
      );
    });

    it("empties it for a module factory too, not just a bare import", () => {
      // decide's catalog wraps its Vue runtime in the helper this way. Matching the call *shape*
      // left this one alone, so the helper ran in the render, resolved its links against the
      // render's origin, and the pages shipped two links to `http://localhost`.
      const loader =
        "async function vue_ce_import(e){let{defineCustomElement:t}=await n(async()=>{let{defineCustomElement:e}=await import(`./chunks/vue.runtime.esm-bundler.js`);return{defineCustomElement:e}},__vite__mapDeps([0,1]),import.meta.url)}";

      assert.ok(renderable(loader).includes("},[],import.meta.url)"));
      assert.ok(!renderable(loader).includes("__vite__mapDeps([0,1])"));
    });
  });

  describe("stylesFor", () => {
    it("links the stylesheet of every component the html uses", () => {
      const html = `<demo-pages-home></demo-pages-home><demo-components-header></demo-components-header>`;

      assert.deepEqual(stylesFor(html, demoManifest, demoCatalog), [
        "/assets/header-abc.css",
        "/assets/home-abc.css",
      ]);
    });

    it("links nothing for a component the html does not use", () => {
      assert.deepEqual(stylesFor(`<demo-pages-home></demo-pages-home>`, demoManifest, demoCatalog), [
        "/assets/home-abc.css",
      ]);
    });

    it("ignores a module that is not a component", () => {
      assert.deepEqual(stylesFor(`<div></div>`, demoManifest, demoCatalog), []);
    });
  });

  describe("ceRenderToString", () => {
    it("expands a page component into the markup it renders", async () => {
      const html = await render("<explore-pages-home></explore-pages-home>");

      assert.match(html, /<explore-pages-home[^>]*><div data-boundary-page="explore">/);
      assert.match(html, /<main id="main" class="e_HomePage">/);
      assert.match(html, /<\/explore-pages-home>/);
    });

    it("links the stylesheets the expanded components need", async () => {
      const html = await render("<explore-pages-home></explore-pages-home>");
      const urls = stylesFor(html, manifest, catalog);

      assert.ok(urls.length > 0, "the home page has stylesheets");

      for (const url of urls) {
        assert.ok(html.includes(`<link rel="stylesheet" href="${url}">`), `links ${url}`);
      }
    });

    it("leaves a tag no catalog declares as the placeholder it is", async () => {
      const html = await render("<div><span-nothing></span-nothing></div>");

      assert.match(html, /<span-nothing><\/span-nothing>/);
    });

    it("refuses to render without knowing where its catalog is served", async () => {
      await assert.rejects(
        () => ceRenderToString("<explore-pages-home></explore-pages-home>", manifest, catalog),
        /catalog is served under/,
      );
    });
  });
});
