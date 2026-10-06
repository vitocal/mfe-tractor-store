import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";

import { cleanup, define, flush, mount } from "../test/dom.ts";

const TAG = "explore-pages-home";

describe("<explore-pages-home>", () => {
  afterEach(cleanup);

  it("registers the custom element", async () => {
    await define(TAG);

    assert.equal(typeof customElements.get(TAG), "function");
  });

  it("renders the explore page boundary", async () => {
    const el = await mount(TAG);

    assert.ok(el.querySelector('[data-boundary-page="explore"]'), "renders the page boundary");
    assert.ok(el.querySelector("main#main.e_HomePage"), "renders <main id='main'>");
  });

  it("renders one teaser link per category", async () => {
    const el = await mount(TAG);

    const links = [...el.querySelectorAll(".e_HomePage__categoryLink")];

    assert.deepEqual(
      links.map((a) => ({ href: a.getAttribute("href"), text: a.textContent })),
      [
        { href: "/products/classic", text: "Classic Tractors" },
        { href: "/products/autonomous", text: "Autonomous Tractors" },
      ],
    );

    // The teaser images carry a srcset, so the browser picks a size before it loads
    const img = links[0].querySelector("img");
    assert.equal(img?.getAttribute("src"), "/cdn/img/scene/500/classics.webp");
    assert.equal(
      img?.getAttribute("srcset"),
      "/cdn/img/scene/500/classics.webp 500w, /cdn/img/scene/1000/classics.webp 1000w",
    );
    assert.equal(img?.getAttribute("sizes"), "100vw, (min-width: 500px) 50vw");
  });

  it("leaves the header and footer slots, and reserves the header height", async () => {
    const el = await mount(TAG);

    const header = el.querySelector("explore-components-header");
    assert.equal(header?.getAttribute("loading"), "eager");
    assert.equal(header?.getAttribute("style"), "min-height: 187px;");

    const footer = el.querySelector("explore-components-footer");
    assert.equal(footer?.getAttribute("loading"), "eager");
  });

  it("mounts recommendations for the featured skus", async () => {
    const el = await mount(TAG);

    // home.ce imports recommendations.ce, so the nested component is already
    // registered and upgrades itself; one more flush lets its props land.
    await flush();

    const recs = el.querySelector(".e_HomePage__recommendations explore-components-recommendations");
    assert.ok(recs, "renders the recommendations slot");
    assert.equal(recs.getAttribute("loading"), "visible");

    const items = recs.querySelectorAll(".e_Recommendations_list .e_Recommendation");
    assert.equal(items.length, 4, "renders the recommended products");
    assert.ok(items[0].querySelector(".e_Recommendation_image"), "renders recommendation images");
  });

  it("matches the checked-in snapshot", async () => {
    const el = await mount(TAG);
    await flush();

    const expected = await readFile(new URL("./__snapshots__/home.html", import.meta.url), "utf8");

    assert.equal(el.outerHTML, expected.trim());
  });
});
