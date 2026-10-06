import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import CEAutoLoader from "ce-autoloader";

import { catalog, cleanup } from "./dom.ts";

const TAG = "explore-components-footer";

/** Polls until `predicate()` is truthy, or fails after `timeout` */
async function waitFor(predicate: () => boolean, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;

  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the registry");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("ce-autoloader registry", () => {
  let registry: CEAutoLoader | undefined;

  afterEach(() => {
    registry?.clean();
    registry = undefined;
    cleanup();
  });

  it("discovers and defines a catalog element that is added to the page", async () => {
    const errors: unknown[] = [];

    registry = new CEAutoLoader({
      catalog,
      root: document.body,
      devErrors: false,
      hooks: { error: (error) => errors.push(error) },
    });

    const el = document.createElement(TAG);
    el.setAttribute("loading", "eager");
    document.body.append(el);

    // The registry watches the DOM and upgrades on its next (debounced) pass
    await waitFor(() => el.getAttribute("ce") === "defined");

    assert.ok(customElements.get(TAG), "defines the element");
    assert.ok(el.querySelector(".e_Footer__inner"), "renders the component");
    assert.deepEqual(errors, [], "loads without errors");
  });

  it("reports elements that are not in the catalog", async () => {
    const errors: Array<{ name?: string }> = [];

    registry = new CEAutoLoader({
      catalog,
      root: document.body,
      devErrors: false,
      hooks: { error: (error) => errors.push(error) },
    });

    const el = document.createElement("explore-components-unknown");
    el.setAttribute("loading", "eager");
    document.body.append(el);

    await waitFor(() => errors.length > 0);

    assert.equal(errors[0].name, "explore-components-unknown");
    assert.equal(el.getAttribute("ce"), null, "leaves unknown elements untouched");
  });
});
