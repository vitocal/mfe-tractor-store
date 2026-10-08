import assert from "node:assert/strict";
import FS from "node:fs/promises";
import Path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * What a catalog is allowed to be.
 *
 * A catalog is a lookup table: tags on one side, the loaders that resolve them on the other. It is
 * read by everyone - the shell loads every team's catalog on every page, and the SSG reads them to
 * find the stylesheets a page needs - so a catalog that imported its framework would put that
 * framework in the graph of all of them. That is what this suite holds it to, and it is why the
 * Vue conversion lives in a `.ce.ts` next to each SFC rather than in `catalog.ts`.
 *
 * The assertions are on the *build*, because that is where the imports are: the source only ever
 * names modules, the bundler decides what a chunk ends up importing.
 */

const TEAM_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = Path.join(TEAM_DIR, "dist");

/** A build manifest entry, as far as this suite reads it */
interface Entry {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
}

const manifest = JSON.parse(
  await FS.readFile(Path.join(DIST, ".vite", "manifest.json"), "utf8"),
) as Record<string, Entry>;

/** Every `.ce.ts` in the team: one custom element per component, which is what a catalog lists */
async function componentModules(): Promise<string[]> {
  const files = await FS.readdir(TEAM_DIR, { recursive: true });

  return files
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".ce.ts") && !file.startsWith("dist/"))
    .sort();
}

describe("the decide catalog", () => {
  it("is built, so there is something to read", () => {
    assert.ok(manifest["catalog.ts"], "the build emits a catalog entry");
  });

  it("imports nothing of its own: no module it names comes from outside the team", () => {
    const entry = manifest["catalog.ts"];
    const direct = [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])];
    const foreign = direct.filter((module) => module.includes("node_modules"));

    // The loaders are the whole of it: what the catalog resolves, and the bundler's own runtime
    // for the dynamic imports. A framework in this list is a framework in everyone's graph.
    assert.deepEqual(foreign, [], "the catalog points at components, it does not import them itself");
  });

  it("lists every custom element of the team, and nothing else", async () => {
    const entry = manifest["catalog.ts"];

    assert.deepEqual([...(entry.dynamicImports ?? [])].sort(), await componentModules());
  });

  it("ships a catalog.js that imports no framework", async () => {
    const source = await FS.readFile(Path.join(DIST, "catalog.js"), "utf8");
    const urls = [...source.matchAll(/(?:import\(|from\s*)["']([^"']+)["']/g)].map(([, url]) => url);

    // The preload map a loader carries *names* the component's chunks, framework included, and that
    // is fine - the browser preloads what the chunk it is about to import needs. An import is not.
    assert.deepEqual(urls.filter((url) => url.includes("vue")), []);
  });
});
