import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";

import { cleanup, define, mount } from "../test/dom.ts";

const TAG = "explore-components-header";

describe("<explore-components-header>", () => {
  afterEach(cleanup);

  it("registers the custom element", async () => {
    await define(TAG);

    assert.equal(typeof customElements.get(TAG), "function");
  });

  it("renders the explore boundary and the cutter/inner structure", async () => {
    const el = await mount(TAG);

    const header = el.querySelector("header.e_Header");
    assert.ok(header, 'renders a <header class="e_Header">');
    assert.equal(header.getAttribute("data-boundary"), "explore");

    assert.ok(
      el.querySelector(".e_Header__cutter > .e_Header__inner"),
      "renders .e_Header__cutter > .e_Header__inner",
    );
  });

  it("renders the logo as a link home", async () => {
    const el = await mount(TAG);

    const link = el.querySelector(".e_Header__link");
    assert.equal(link?.getAttribute("href"), "/");

    const logo = link?.querySelector("img.e_Header__logo");
    assert.ok(logo, "renders the logo");
    assert.equal(logo.getAttribute("src"), "/cdn/img/logo.svg");
    assert.equal(logo.getAttribute("alt"), "Micro Frontends - Tractor Store");
  });

  it("renders the navigation links", async () => {
    const el = await mount(TAG);

    const links = [...el.querySelectorAll(".e_Navigation__item a")].map((a) => ({
      text: a.textContent,
      href: a.getAttribute("href"),
    }));

    assert.deepEqual(links, [
      { text: "Machines", href: "/products" },
      { text: "Stores", href: "/stores" },
    ]);
  });

  it("leaves a slot for the checkout mini-cart", async () => {
    const el = await mount(TAG);

    const cart = el.querySelector(".e_Header__cart");
    assert.ok(cart, "renders the cart slot");

    // The header only owns the slot: the mini-cart belongs to the checkout team
    assert.ok(
      cart.querySelector("checkout-components-minicart"),
      "renders a <checkout-components-minicart> placeholder",
    );
  });

  it("matches the checked-in snapshot", async () => {
    const el = await mount(TAG);

    const expected = await readFile(new URL("./__snapshots__/header.html", import.meta.url), "utf8");

    assert.equal(el.outerHTML, expected.trim());
  });
});
