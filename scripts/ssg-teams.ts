/**
 * The teams the SSG pass covers, and what it needs to know about each.
 *
 * A team is covered when it has a built route table (`dist/routes.js`) and a custom element
 * extension to recognise its components by. The parameter values are what turn a route
 * *pattern* into the pages to write: `/product/:id` is one page per product, and the products
 * come from the team's own database.
 *
 * This is the one list of teams there is: the SSG walks it, and so do the tests - see
 * `team-render.ts`. A team added here is a team the pass writes pages for and the suite renders.
 */

import FS from "node:fs/promises";
import Path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");

export interface Team {
  /** The team folder, and the prefix its custom element tags use */
  name: string;
  /** The custom element extension the team's build uses, eg `.ce.tsx` */
  extension: string;
  /** Values for the route params, read lazily so one team's pass needs no other's database */
  params(): Promise<Record<string, string[]>>;
}

/** A team database, as far as the pass cares: the keys its routes use as params */
interface TeamDatabase {
  categories?: Array<{ key: string }>;
  products?: Array<{ id: string }>;
}

/** Reads a team's database, which sits next to its components */
async function readDatabase(team: string): Promise<TeamDatabase> {
  const file = Path.join(ROOT_DIR, team, "database", "database.json");

  try {
    return JSON.parse(await FS.readFile(file, "utf8"));
  } catch {
    throw new Error(`The ${team} database is missing (${Path.relative(ROOT_DIR, file)}).`);
  }
}

export const TEAMS = [
  {
    name: "explore",
    extension: ".ce.tsx",
    async params() {
      const { categories = [] } = await readDatabase("explore");

      return { category: categories.map(({ key }) => key) };
    },
  },
  {
    name: "decide",
    extension: ".ce.vue",
    async params() {
      const { products = [] } = await readDatabase("decide");

      return { id: products.map(({ id }) => id) };
    },
  },
  {
    name: "checkout",
    extension: ".ce.svelte",
    // Every checkout route is a fixed path: the cart, the form, the receipt
    async params() {
      return {};
    },
  },
] as const satisfies readonly Team[];
