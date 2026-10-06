import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seedStorage } from "../../scripts/team-render.ts";

import { renderPage } from "../test/render.ts";

const TAG = "checkout-pages-cart";

/** Where the cart's state lives - see `../state.ts`, which reads it while its module loads */
const CART_KEY = "tractor_shopping_cart";

describe("<checkout-pages-cart>", () => {
  it("renders the page boundary and an empty basket", async () => {
    const html = await renderPage(TAG);

    assert.match(html, /<checkout-pages-cart[^>]*><div data-boundary-page="checkout">/);
    assert.match(html, /<h2>Basket<\/h2>/);
    assert.match(html, /<p>No items in cart<\/p>/);
    assert.match(html, /<p class="c_CartPage__total">Total: \$0 Ø<\/p>/);
  });

  it("renders a line item per item in the cart", async () => {
    const setup = seedStorage({ [CART_KEY]: [{ sku: "AU-01-SI", quantity: 2 }] });
    const html = await renderPage(TAG, { setup });

    assert.match(html, /<li class="c_LineItem">/);
    assert.match(html, /href="\/product\/AU-01\?sku=AU-01-SI"/);
    assert.match(html, /Total: \$2000 Ø/);
    assert.ok(!html.includes("No items in cart"), "the empty state is gone");
  });

  it("leaves the components it does not own as placeholders", async () => {
    const html = await renderPage(TAG);

    // The header, the recommendations and the footer belong to explore: this page only owns the
    // slot it leaves for them, and does not render them itself.
    for (const tag of [
      "explore-components-header",
      "explore-components-recommendations",
      "explore-components-footer",
    ]) {
      assert.match(html, new RegExp(`<${tag}[^>]*></${tag}>`), `leaves <${tag}> as a placeholder`);
    }

    // The design system belongs to the shell. Its buttons keep the label they were written with
    // and no button is rendered for them.
    assert.match(html, /<ds-button[^>]*>Checkout<\/ds-button>/);
    assert.ok(!html.includes("<button"), "does not render the design system's button");
  });

  it("links the stylesheet its own markup needs", async () => {
    const html = await renderPage(TAG);

    assert.match(html, /<link rel="stylesheet" href="\/assets\/cart-[^"]+\.css">/);
  });
});
