/**
 * Rendering a team's pages the way the SSG renders them, and the contract every team's pages are
 * held to.
 *
 * A team's own `dist` is the input: the built catalog maps every custom element tag to a lazy
 * loader, and the build manifest says which stylesheet each module was compiled into. Those are
 * the two things the SSG renders from, so a page that renders here is a page that renders at
 * build time - which is the point of testing a page this way rather than mounting it by hand.
 *
 * A team adopts a *preset*: one line in `<team>/test/render.ts` binds its build, and
 * `describePages` holds the pages that build publishes to the properties at the bottom of this
 * file. Nothing here reads a team's build until its preset is asked for, so one team's tests
 * need no other team's `dist`.
 *
 * `ceRenderToString` runs a Happy DOM ServerRenderer, which brings its own window, so a render
 * test needs no global DOM: checkout and decide register none, and explore's script registers one
 * only for the component tests that mount by hand.
 */

import assert from "node:assert/strict";
import FS from "node:fs";
import Path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ceRenderToString } from "./ce-render.ts";
import type { Catalog } from "./ce-render.ts";
import type { Manifest } from "./component-styles.ts";
import { TEAMS } from "./ssg-teams.ts";

/** The repo root, which is also the root every team's catalog url resolves inside */
const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");

/** Long enough for a real render, short enough that a page which hangs fails a test fast */
const RENDER_TIMEOUT = 10000;

/** A team the SSG covers, and therefore one whose pages can be rendered */
export type TeamName = (typeof TEAMS)[number]["name"];

/** What a render can be given */
export interface RenderOptions {
  /** Attributes for the element, eg the `id` a product page needs to find its product */
  attributes?: Record<string, string>;
  /** Markup the element arrives with, the way a prerendered page does */
  children?: string;
  /**
   * A script to run before the page upgrades. It is the only way to seed what a page reads while
   * its module loads - `seedStorage` below is the preset for that.
   */
  setup?: string;
}

/** A team's test harness: what its build published, and a renderer that uses it */
export interface TeamHarness {
  /** The team's folder name, and the prefix its custom element tags use */
  name: TeamName;
  /** What the team's build emitted, and the stylesheet each module was compiled into */
  manifest: Manifest;
  /** The team's built catalog: tag -> loader, the same file the browser loads */
  catalog: Catalog;
  /** Every page tag the build publishes, eg `checkout-pages-cart` */
  pageTags: string[];
  /** Renders `html` with the team's built components, the way the SSG does */
  render(html: string, options?: RenderOptions): Promise<string>;
  /** Renders the page `<tag>` */
  renderPage(tag: string, options?: RenderOptions): Promise<string>;
  /**
   * Renders a page the way a browser upgrades a prerendered one: the markup the build writes, and
   * then that same markup arriving as the page's children.
   */
  upgradePage(
    tag: string,
    options?: RenderOptions,
  ): Promise<{ prerendered: string; upgraded: string }>;
}

/**
 * The preset for a team the SSG covers.
 *
 * Throws when the team has no build: a test that renders pages means nothing without one, and the
 * message says what to run.
 */
export async function teamHarness(name: TeamName): Promise<TeamHarness> {
  if (!TEAMS.some((team) => team.name === name)) {
    throw new Error(
      `No team "${name}". The SSG covers: ${TEAMS.map((team) => team.name).join(", ")}.`,
    );
  }

  const manifestFile = Path.join(ROOT_DIR, name, "dist", ".vite", "manifest.json");

  if (!FS.existsSync(manifestFile)) {
    throw new Error(`${name} has no build to render - run \`npm run build -w ${name}\` first.`);
  }

  const manifest = JSON.parse(FS.readFileSync(manifestFile, "utf8")) as Manifest;
  const catalogUrl = `/${name}/dist/catalog.js`;

  // The built catalog ships without type declarations of its own, so it is imported through a
  // variable specifier.
  const catalog: Catalog = (
    await import(/* @vite-ignore */ new URL(`../${name}/dist/catalog.js`, import.meta.url).href)
  ).default;

  const pageTags = Object.keys(catalog)
    .filter((tag) => tag.startsWith(`${name}-pages-`))
    .sort();

  const render = (html: string, options: RenderOptions = {}) =>
    ceRenderToString(`${options.setup ?? ""}${html}`, manifest, catalog, {
      catalogUrl,
      roots: [ROOT_DIR],
      timeout: RENDER_TIMEOUT,
    });

  const renderPage = (tag: string, options: RenderOptions = {}) => {
    const attrs = Object.entries(options.attributes ?? {})
      .map(([attribute, value]) => ` ${attribute}="${value}"`)
      .join("");

    return render(`<${tag}${attrs}>${options.children ?? ""}</${tag}>`, options);
  };

  const upgradePage = async (tag: string, options: RenderOptions = {}) => {
    const prerendered = await renderPage(tag, options);

    return {
      prerendered,
      upgraded: await renderPage(tag, { ...options, children: elementOf(prerendered, tag) }),
    };
  };

  return { name, manifest, catalog, pageTags, render, renderPage, upgradePage };
}

/* ------------------------------------------------------------------ presets -- */

/**
 * A script that fills storage before the page upgrades, as a browser that has shopped in arrives.
 *
 * A page reads its state while its module loads, which is before any render can reach into it, so
 * this is the only way in: `{ setup: seedStorage({ tractor_shopping_cart: items }) }`.
 */
export function seedStorage(entries: Record<string, unknown>): string {
  const calls = Object.entries(entries)
    .map(([key, value]) => {
      const stored = JSON.stringify(JSON.stringify(value));

      return `localStorage.setItem(${JSON.stringify(key)}, ${stored});`;
    })
    .join("");

  return `<script>${calls}</script>`;
}

/** The page's own markup, as the prerendered file carries it */
export function elementOf(html: string, tag: string): string {
  const start = html.indexOf(`<${tag}`);
  const end = html.lastIndexOf(`</${tag}>`);

  return start === -1 || end === -1 ? "" : html.slice(start, end + tag.length + 3);
}

/** How many page boundaries the html renders */
export function boundaries(html: string): number {
  return (html.match(/data-boundary-page=/g) ?? []).length;
}

/* -------------------------------------------------------------------- suite -- */

/**
 * The contract every team's pages are held to.
 *
 * The pages come from the built catalog rather than a list, so a page added to `pages/` is covered
 * the moment it is built. The SSG writes every one of them, and a page that stops rendering has to
 * fail here, where it says which one, rather than at build time.
 */
export function describePages({ name, pageTags, renderPage, upgradePage }: TeamHarness): void {
  describe(`${name} pages`, () => {
    it("publishes pages to render", () => {
      assert.ok(pageTags.length > 0, "the built catalog declares no pages");
    });

    for (const tag of pageTags) {
      it(`${tag} renders`, async () => {
        // A component that will not load throws out of the render - a page that quietly lost its
        // content is worse than one that fails.
        await assert.doesNotReject(() => renderPage(tag), `${tag} should render`);
      });

      it(`${tag} replaces the markup a prerendered page arrives with`, async () => {
        const { prerendered, upgraded } = await upgradePage(tag);

        // Svelte mounts by *appending*, so without `adoptPrerenderedMarkup` the build-time render
        // stays and the live one lands below it: `/checkout/cart` showed the basket as it was when
        // the page was built, with the real one underneath. Preact and Vue replace on their own,
        // and this is the property that holds all three to the same behaviour.
        assert.equal(
          boundaries(upgraded),
          boundaries(prerendered),
          "the page renders once, not twice",
        );
      });
    }
  });
}

