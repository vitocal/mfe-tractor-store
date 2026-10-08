import FS from "node:fs/promises";
import Path from "node:path";

import type { Plugin } from "vite";

import { TEAMS } from "./ssg-teams.ts";

/** The files a team publishes at the root of its build, which the shell fetches by url */
const FILES = ["catalog.js", "routes.js"];

/** The directories of a team build the browser fetches from */
const DIRECTORIES = ["chunks", "assets"];

/** Filenames in `dir`; an empty list when it does not exist (a team that emitted none) */
async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await FS.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".map"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Does `file` exist? */
async function exists(file: string): Promise<boolean> {
  try {
    await FS.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Copies `source` to `target`, making the directory it goes into */
async function copy(source: string, target: string): Promise<void> {
  await FS.mkdir(Path.dirname(target), { recursive: true });
  await FS.copyFile(source, target);
}

/**
 * Stages each team's build into the shell's output, under the team's own path.
 *
 * ## Why this is necessary
 *
 * The shell does not bundle the teams. `src/catalog.ts` and `src/routes.ts` fetch
 * `/<team>/dist/catalog.js` and `/<team>/dist/routes.js` at runtime - the same urls the SSG's
 * render and the bench read a team's build from (`scripts/ssg.ts`, `scripts/ce-render.ts`). A url
 * is only useful if the file is where the url says it is *in what gets deployed*, and what gets
 * deployed is this `dist/`: `vite preview` serves it, and so does a static host. The teams' builds
 * live in the workspace, which is not deployed, so without this `/explore/dist/catalog.js` - and
 * every chunk and stylesheet behind it - is a 404, and the page keeps the markup it was prerendered
 * with and upgrades nothing.
 *
 * ## What it copies, and what it leaves behind
 *
 * What the browser asks for, and nothing else:
 *
 * - `catalog.js` and `routes.js`: the two entries the shell fetches. A missing one fails the build:
 *   while the teams were bundled, an unresolved import did that, and now that the shell fetches by
 *   url nothing else would notice until a browser asked for a 404.
 * - `chunks/`: the components those catalogs lazy-load, and what those import in turn.
 * - `assets/`: the stylesheets a component's preload map names, which is what keeps a component
 *   from being defined before its styles are there (see `component-styles.ts`).
 *
 * `.vite/manifest.json` is not copied - the build reads a team's manifest from the team's own
 * folder. Neither is `cdn/`, which a team's build carries a copy of: a component asks for
 * `/cdn/...`, an absolute url, and the site serves that from the shell's own `public/`.
 *
 * ## What this used to do
 *
 * The shell used to bundle the teams, and the preload maps inside the teams' catalogs are written
 * relative to the url of the catalog that carries them. Bundled into the shell's entry chunk those
 * paths pointed at the shell's root instead, so this pass filled in the files the shell did not
 * emit - the rolldown runtime, the teams' stylesheets - next to the shell's own `/chunks` and
 * `/assets`. That arrangement is also why a team's catalog could not simply be given a chunk of its
 * own: any chunk but the root one doubled the paths (`/chunks/chunks/home.ce.js`). None of that
 * survives here: a team's catalog is fetched from the team's own build, so the paths inside it
 * resolve where they were written, and there is nothing left to fill in - only a build to make
 * reachable.
 */
export function stageTeamAssets(): Plugin {
  let root = process.cwd();
  let outDir = "";

  return {
    name: "shell:stage-team-assets",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = Path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const staged: string[] = [];

      for (const team of TEAMS) {
        const source = Path.join(root, team.name, "dist");
        const target = Path.join(outDir, team.name, "dist");

        for (const file of FILES) {
          if (!(await exists(Path.join(source, file)))) {
            throw new Error(
              `The ${team.name} build is missing (${Path.relative(root, Path.join(source, file))}). ` +
                `Run "npm run build -w ${team.name}" first.`,
            );
          }

          await copy(Path.join(source, file), Path.join(target, file));
          staged.push(`${team.name}/dist/${file}`);
        }

        for (const directory of DIRECTORIES) {
          for (const file of await listFiles(Path.join(source, directory))) {
            await copy(Path.join(source, directory, file), Path.join(target, directory, file));
            staged.push(`${team.name}/dist/${directory}/${file}`);
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log(`  staged ${staged.length} team file(s) under /<team>/dist/`);
    },
  };
}

export default stageTeamAssets;
