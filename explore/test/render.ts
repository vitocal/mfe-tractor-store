/**
 * The explore preset.
 *
 * The harness itself is generic - see [`team-render.ts`](../../scripts/team-render.ts) - and this
 * is what binds it to this team: its folder, its build, and the pages that build publishes.
 * Everything the page tests need comes from here, and so does the suite in `./pages.test.ts`.
 *
 * This is the same preset the other teams adopt. It renders from the *built* catalog and manifest,
 * the way the SSG does, which is why the component tests next to the components still use
 * `./dom.ts` instead: those mount a single element and assert on the DOM, rather than rendering a
 * whole page.
 */

import { teamHarness } from "../../scripts/team-render.ts";

export const harness = await teamHarness("explore");
export const { manifest, catalog, pageTags, render, renderPage, upgradePage } = harness;
