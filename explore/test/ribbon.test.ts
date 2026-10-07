import assert from "node:assert/strict";
import FS from "node:fs";
import Path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { RenderModeRibbon, RIBBON_ATTRIBUTE, RIBBON_TAG } from "../../src/components/ribbon.ts";

/**
 * The ribbon lives in the shell (`src/components/ribbon.ts`) and has no test runner of its own, so it is
 * covered here, next to the other shell modules (`router`, `tags`, `prerendered`).
 */
const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Mounts `<render-mode>` the way `index.html` does, and returns it */
function mount(): RenderModeRibbon {
  const ribbon = document.createElement(RIBBON_TAG) as RenderModeRibbon;

  document.body.append(ribbon);

  return ribbon;
}

describe("ribbon", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("the custom element", () => {
    it("registers the tag the pages carry", () => {
      assert.equal(customElements.get(RIBBON_TAG), RenderModeRibbon);
    });

    it("says nothing until it is told a mode, so it can not guess", () => {
      const ribbon = mount();

      assert.equal(ribbon.textContent, "");
      assert.equal(ribbon.getAttribute(RIBBON_ATTRIBUTE), null);
    });

    it("shows the mode the shell saw", () => {
      const ribbon = mount();

      ribbon.setAttribute(RIBBON_ATTRIBUTE, "server");
      assert.equal(ribbon.textContent, "server");
      assert.equal(ribbon.getAttribute(RIBBON_ATTRIBUTE), "server");

      ribbon.setAttribute(RIBBON_ATTRIBUTE, "client");
      assert.equal(ribbon.textContent, "client");
      assert.equal(ribbon.getAttribute(RIBBON_ATTRIBUTE), "client");
    });

    it("explains what the mode means, since the label is a single word", () => {
      const ribbon = mount();

      ribbon.setAttribute(RIBBON_ATTRIBUTE, "server");
      const prerendered = ribbon.title;

      ribbon.setAttribute(RIBBON_ATTRIBUTE, "client");
      const browser = ribbon.title;

      assert.match(prerendered, /prerendered/);
      assert.match(browser, /browser/);
      assert.notEqual(prerendered, browser);
    });

    it("updates in place, so navigating can not stack ribbons", () => {
      const ribbon = mount();

      ribbon.setAttribute(RIBBON_ATTRIBUTE, "server");
      ribbon.setAttribute(RIBBON_ATTRIBUTE, "client");
      ribbon.setAttribute(RIBBON_ATTRIBUTE, "server");

      assert.equal(document.querySelectorAll(RIBBON_TAG).length, 1);
    });

    it("reflects the mode through the property the shell reads back", () => {
      const ribbon = mount();

      ribbon.mode = "client";
      assert.equal(ribbon.getAttribute(RIBBON_ATTRIBUTE), "client");

      ribbon.mode = null;
      assert.equal(ribbon.getAttribute(RIBBON_ATTRIBUTE), null);
      assert.equal(ribbon.textContent, "");
    });
  });

  describe("the shell's stylesheet", () => {
    it("styles the tag the ribbon uses, in both modes", () => {
      const css = FS.readFileSync(Path.join(ROOT_DIR, "src", "styles.css"), "utf8");

      assert.match(css, new RegExp(`${RIBBON_TAG}\\s*\\{`));
      assert.match(css, new RegExp(`${RIBBON_TAG}\\[${RIBBON_ATTRIBUTE}="server"\\]`));
    });
  });
});
