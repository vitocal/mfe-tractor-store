import assert from "node:assert/strict";
import FS from "node:fs";
import Path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createRibbon, RIBBON_CLASS } from "../../src/ribbon.ts";

/**
 * The ribbon lives in the shell (`src/ribbon.ts`) and has no test runner of its own, so it is
 * covered here, next to the other shell modules (`router`, `tags`, `prerendered`).
 */
const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Mounts a ribbon and returns it with the setter the shell keeps */
function mount(): { setMode: (mode: "ssg" | "spa") => void; ribbon: HTMLElement } {
  const setMode = createRibbon(document.body);
  const ribbon = document.querySelector<HTMLElement>(`.${RIBBON_CLASS}`);

  assert.ok(ribbon, "the ribbon is appended to the host");

  return { setMode, ribbon };
}

describe("ribbon", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("createRibbon", () => {
    it("says nothing until it is told a mode, so it can not guess", () => {
      const { ribbon } = mount();

      assert.equal(ribbon.textContent, "");
      assert.equal(ribbon.dataset.mode, undefined);
    });

    it("shows the mode the shell saw", () => {
      const { setMode, ribbon } = mount();

      setMode("ssg");
      assert.equal(ribbon.textContent, "SSG");
      assert.equal(ribbon.dataset.mode, "ssg");

      setMode("spa");
      assert.equal(ribbon.textContent, "SPA");
      assert.equal(ribbon.dataset.mode, "spa");
    });

    it("explains what the mode means, since the label is only three letters", () => {
      const { setMode, ribbon } = mount();

      setMode("ssg");
      const prerendered = ribbon.title;

      setMode("spa");
      const browser = ribbon.title;

      assert.match(prerendered, /prerendered/);
      assert.match(browser, /browser/);
      assert.notEqual(prerendered, browser);
    });

    it("updates in place, so navigating can not stack ribbons", () => {
      const { setMode } = mount();

      setMode("ssg");
      setMode("spa");
      setMode("ssg");

      assert.equal(document.querySelectorAll(`.${RIBBON_CLASS}`).length, 1);
    });
  });

  describe("the shell's stylesheet", () => {
    it("styles the class the ribbon uses, in both modes", () => {
      const css = FS.readFileSync(Path.join(ROOT_DIR, "src", "styles.css"), "utf8");

      assert.match(css, new RegExp(`\\.${RIBBON_CLASS}\\s*\\{`));
      assert.match(css, new RegExp(`\\.${RIBBON_CLASS}\\[data-mode="ssg"\\]`));
    });
  });
});
