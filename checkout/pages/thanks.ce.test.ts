import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderPage } from "../test/render.ts";

const TAG = "checkout-pages-thanks";

describe("<checkout-pages-thanks>", () => {
  it("renders the confirmation", async () => {
    // The page loads canvas-confetti from a CDN in `onMount`, and a render has no network, so
    // that import fails. The markup is complete without it - which is what this asserts.
    const html = await renderPage(TAG);

    assert.match(html, /<checkout-pages-thanks[^>]*><div data-boundary-page="checkout">/);
    assert.match(html, /<main class="c_Thanks">/);
    assert.match(html, /<h2 class="c_Thanks__title">Thanks for your order!<\/h2>/);
    assert.match(html, /We'll notify you, when its ready for pickup\./);
  });

  it("leaves the header, the footer and the button to the teams that own them", async () => {
    const html = await renderPage(TAG);

    assert.match(html, /<explore-components-header><\/explore-components-header>/);
    assert.match(html, /<explore-components-footer><\/explore-components-footer>/);
    assert.match(html, /<ds-button[^>]*>Continue Shopping<\/ds-button>/);
  });

  it("links the stylesheet its own markup needs", async () => {
    const html = await renderPage(TAG);

    assert.match(html, /<link rel="stylesheet" href="\/assets\/thanks-[^"]+\.css">/);
  });
});
