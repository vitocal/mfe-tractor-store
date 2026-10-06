import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderPage } from "../test/render.ts";

const TAG = "decide-pages-product";

/** A product in this team's own database. The page finds it by `id`, and its variant by `sku` */
const ID = "AU-01";
const SKU = "AU-01-SI";

/** Renders the page for a product */
function renderProduct(attributes: Record<string, string> = { id: ID, sku: SKU }): Promise<string> {
  return renderPage(TAG, { attributes });
}

describe("<decide-pages-product>", () => {
  it("renders the product it was given", async () => {
    const html = await renderProduct();

    assert.match(html, /<decide-pages-product[^>]*><div data-boundary-page="decide">/);
    assert.match(html, /<main id="main" class="d_ProductPage">/);
    assert.match(html, /<h2 class="d_ProductPage__title">TerraFirma AutoCultivator T-300<\/h2>/);
    assert.match(html, /src="\/cdn\/img\/product\/400\/AU-01-SI\.webp"/);
    assert.match(
      html,
      /srcset="\/cdn\/img\/product\/400\/AU-01-SI\.webp 400w, \/cdn\/img\/product\/800\/AU-01-SI\.webp 800w"/,
    );
  });

  it("renders a variant option per variant, with the selected one emphasised", async () => {
    const html = await renderProduct();

    // The variant component is decide's own, so it expands here too.
    assert.match(html, /<decide-components-variant[^>]*><li class="d_VariantOption"/);
    assert.match(html, /href="\/product\/AU-01\?sku=AU-01-SI"/);
    assert.match(html, /<strong>Silver<\/strong>/);
  });

  it("falls back to the first variant when the sku is not one of them", async () => {
    const html = await renderProduct({ id: ID, sku: "NOPE-99" });

    assert.match(html, /AU-01-SI/);
  });

  it("says so when the id is not a product", async () => {
    const html = await renderProduct({ id: "NOPE-99" });

    assert.match(html, /<div class="d_ProductPage__notfound"><h1>Product not found<\/h1><\/div>/);
  });

  it("leaves the components it does not own as placeholders", async () => {
    const html = await renderProduct();

    // Add to cart belongs to checkout, the header, footer and recommendations to explore, and
    // json-viewer to no team at all - no catalog declares it.
    for (const tag of [
      "explore-components-header",
      "explore-components-recommendations",
      "explore-components-footer",
      "checkout-components-addtocart",
      "json-viewer",
    ]) {
      assert.match(html, new RegExp(`<${tag}[^>]*>`), `leaves <${tag}> alone`);
    }
  });

  it("links the stylesheets of the components it renders", async () => {
    const html = await renderProduct();

    assert.match(html, /href="\/assets\/product-[^"]+\.css"/);
    assert.match(html, /href="\/assets\/variant-[^"]+\.css"/);
  });
});
