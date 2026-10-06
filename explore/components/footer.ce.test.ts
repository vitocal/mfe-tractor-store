import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";

import { cleanup, define, mount } from "../test/dom.ts";

const TAG = "explore-components-footer";

describe("<explore-components-footer>", () => {
  afterEach(cleanup);

  it("registers the custom element", async () => {
    await define(TAG);

    assert.equal(typeof customElements.get(TAG), "function");
  });

  it("renders the explore boundary and the cutter/inner structure", async () => {
    const el = await mount(TAG);

    const footer = el.querySelector("footer.e_Footer");
    assert.ok(footer, 'renders a <footer class="e_Footer">');
    assert.equal(footer.getAttribute("data-boundary"), "explore");

    assert.ok(
      el.querySelector(".e_Footer__cutter > .e_Footer__inner"),
      "renders .e_Footer__cutter > .e_Footer__inner",
    );
  });

  it("renders the neuland initiative with a fixed-size logo", async () => {
    const el = await mount(TAG);

    const img = el.querySelector(".e_Footer__initiative img");
    assert.ok(img, "renders the neuland logo");
    assert.equal(img.getAttribute("src"), "/cdn/img/neulandlogo.svg");
    assert.equal(img.getAttribute("alt"), "neuland - Büro für Informatik");
    // Explicit dimensions are what keep the footer from shifting while it loads
    assert.equal(img.getAttribute("width"), "45");
    assert.equal(img.getAttribute("height"), "40");

    const link = el.querySelector(".e_Footer__initiative a");
    assert.equal(link?.getAttribute("href"), "https://micro-frontends.org/tractor-store/");
    assert.equal(link?.getAttribute("target"), "_blank");
  });

  it("renders the techstack credits", async () => {
    const el = await mount(TAG);

    assert.equal(el.querySelector(".e_Footer__credits h3")?.textContent, "techstack");
    assert.match(el.textContent ?? "", /web components, vite, ce-autoloader, preact, vue/);

    const hrefs = [...el.querySelectorAll(".e_Footer__credits a")].map((a) =>
      a.getAttribute("href"),
    );
    assert.deepEqual(hrefs, ["https://github.com/vitocal"]);
  });

  it("matches the checked-in snapshot", async () => {
    const el = await mount(TAG);

    // Guards against drift: if the component markup changes, the snapshot has to
    // change with it. A future SSG step compares its output against the same file.
    const expected = await readFile(new URL("./__snapshots__/footer.html", import.meta.url), "utf8");

    assert.equal(el.outerHTML, expected.trim());
  });
});
