/**
 * The decide preset.
 *
 * The harness itself is generic - see [`team-render.ts`](../../scripts/team-render.ts) - and this
 * is what binds it to this team: its folder, its build, and the pages that build publishes.
 * Everything the page tests need comes from here, and so does the suite in `./pages.test.ts`.
 */

import { teamHarness } from "../../scripts/team-render.ts";

export const harness = await teamHarness("decide");
export const { manifest, catalog, pageTags, render, renderPage, upgradePage } = harness;
