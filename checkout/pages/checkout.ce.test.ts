import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderPage } from "../test/render.ts";

const TAG = "checkout-pages-checkout";

describe("<checkout-pages-checkout>", () => {
  it("renders the form the order needs", async () => {
    const html = await renderPage(TAG);

    assert.match(html, /<checkout-pages-checkout[^>]*><div data-boundary-page="checkout">/);
    assert.match(html, /<main class="c_Checkout">/);
    assert.match(html, /<h2>Checkout<\/h2>/);

    for (const [id, name] of [
      ["c_firstname", "firstname"],
      ["c_lastname", "lastname"],
      ["c_storeId", "storeId"],
    ]) {
      assert.match(html, new RegExp(`id="${id}"[^>]*name="${name}"`), `renders the ${name} field`);
    }
  });

  it("renders the compact header, which this team owns", async () => {
    const html = await renderPage(TAG);

    // Unlike the header the other checkout pages use, this one is in checkout's own catalog,
    // so it expands here.
    assert.match(html, /<checkout-components-compactheader><header class="c_CompactHeader">/);
    assert.match(html, /class="c_CompactHeader__logo"/);
  });

  it("links the stylesheets of the components it renders", async () => {
    const html = await renderPage(TAG);

    // Its own, and the compact header's: a nested component brings its stylesheet with it.
    assert.match(html, /href="\/assets\/checkout-[^"]+\.css"/);
    assert.match(html, /href="\/assets\/compactheader-[^"]+\.css"/);
  });

  it("leaves the store picker to explore and the buttons to the shell", async () => {
    const html = await renderPage(TAG);

    assert.match(html, /<explore-components-storepicker><\/explore-components-storepicker>/);
    assert.match(html, /<explore-components-footer><\/explore-components-footer>/);
    assert.match(html, /<ds-button[^>]*>Place order<\/ds-button>/);
  });
});
