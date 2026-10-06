import FS from "node:fs/promises";
import Path from "node:path";

import type { Plugin } from "vite";

/** Team workspaces, whose builds ship artifacts the shell references by url */
const WORKSPACES = ["explore", "decide", "checkout"];

/** Sub directories of a team build that are referenced by url */
const DIRECTORIES = ["chunks", "assets"];

/** Filenames in `dir`; an empty list when it does not exist (team not built) */
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

/**
 * Stages the team build artifacts into the shell build.
 *
 * The shell bundles the team catalogs, and those catalogs carry the preload maps their own
 * builds generated. Those maps reference the team stylesheets and the rolldown runtime,
 * which are only emitted into the team dists - so the shell output would otherwise ship an
 * `index.js` that 404s on 17 of the files it asks for, and a page without any of the
 * component styles. The 404 also rejects the component import, so the registry ends up
 * marking every custom element as `ce="error"`.
 *
 * Missing files are copied in, existing ones are left alone: the shell build's own chunks
 * win, this only fills the gaps.
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

      for (const workspace of WORKSPACES) {
        for (const directory of DIRECTORIES) {
          const source = Path.join(root, workspace, "dist", directory);

          for (const entry of await listFiles(source)) {
            const target = Path.join(outDir, directory, entry);

            if (await exists(target)) continue;

            await FS.mkdir(Path.dirname(target), { recursive: true });
            await FS.copyFile(Path.join(source, entry), target);
            staged.push(`${directory}/${entry}`);
          }
        }
      }

      if (staged.length) {
        // eslint-disable-next-line no-console
        console.log(`  staged ${staged.length} team file(s) the shell build does not emit`);
      }
    },
  };
}

export default stageTeamAssets;
