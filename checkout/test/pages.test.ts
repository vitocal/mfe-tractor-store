/**
 * This team's pages, held to the contract every team's pages are held to.
 *
 * See `describePages` in [`team-render.ts`](../../scripts/team-render.ts) for what that is: every
 * page the build publishes renders, and renders once even when it arrives with the markup a
 * prerendered page carries.
 */

import { describePages } from "../../scripts/team-render.ts";

import { harness } from "./render.ts";

describePages(harness);
