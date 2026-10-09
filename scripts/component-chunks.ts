/**
 * Which chunk a custom element needs, and what that chunk imports, resolved at build time.
 *
 * The shell fetches its teams at runtime (see `src/catalog.ts`), and a team's catalog loads its
 * components lazily: every loader is a `() => import("…/chunks/<name>.ce-<hash>.js")`. Nothing in
 * the document names those files, so the browser only learns what a page's components are once the
 * catalog has arrived *and been evaluated* - and only learns what those chunks import a round trip
 * after that. Three hops behind the shell's own script, on every navigation, and each hop is a hop
 * the visitor waits for on a page whose markup was already complete.
 *
 * A prerendered page knows all of it up front: the page holds the tags, and each build's manifest
 * says which file a tag compiled into and which manifest keys that file imports. So the prerender
 * can ask for the whole chain in the same round trip as the shell's own script, and the `import()`
 * that follows is a module-map hit rather than a request.
 *
 * Static imports only. A chunk's `dynamicImports` are the components *it* loads lazily - following
 * those would put the whole application on every page, which is the thing code splitting exists to
 * avoid.
 *
 * The stylesheets a tag needs are the same question asked of the same manifests, and they live in
 * `component-styles.ts`; this is the javascript half.
 */

import { toUrl } from "./component-styles.ts";
import type { ComponentBuild } from "./component-styles.ts";

/**
 * tag -> the javascript that tag needs: its chunk, then everything that chunk imports.
 *
 * A chunk's imports are manifest keys (`_utils-D0YnvVpj.js`), so they resolve through the same
 * manifest the chunk came from - a team's chunks import the team's chunks.
 */
export function chunksByTag(builds: ComponentBuild[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const build of builds) {
    for (const module of Object.keys(build.manifest)) {
      // A manifest also lists plain modules - `routes.ts`, the shared chunks. A build's `tagFor`
      // answers null for those: only what its catalog globs can become a tag.
      const tag = build.tagFor(module);

      if (!tag) continue;

      const urls: string[] = [];

      collect(module, build, urls, new Set());

      index.set(tag, urls);
    }
  }

  return index;
}

/**
 * `key`'s file, then everything it imports, depth first, each file once.
 *
 * `seen` is the url rather than the manifest key, because two keys can point at one file - a
 * chunk reachable both directly and through a shared one is fetched once either way.
 */
function collect(key: string, build: ComponentBuild, urls: string[], seen: Set<string>): void {
  const output = build.manifest[key];

  if (!output) return;

  const url = toUrl(output.file, build.urlPrefix);

  if (seen.has(url)) return;

  seen.add(url);
  urls.push(url);

  for (const imported of output.imports ?? []) collect(imported, build, urls, seen);
}

/**
 * The javascript the given tags need.
 *
 * A tag the index does not know is not reported: the stage (`vi-router`) and third party elements
 * are not the builds' business. There is no counterpart to `stylesForTags`'s warning here - a build
 * that declares a tag also declares the file it compiled into, or its manifest is not a manifest.
 */
export function chunksForTags(index: Map<string, string[]>, tags: string[]): string[] {
  const urls = new Set<string>();

  for (const tag of tags) {
    for (const url of index.get(tag) ?? []) urls.add(url);
  }

  return [...urls].sort();
}

/**
 * Marks the chunks the prerender preloads.
 *
 * The marker earns its keep on the second run: the pass writes the root page over the shell html,
 * so its next input is its own output, and the marker is what tells the two apart.
 */
const CHUNKS_MARKER = "<!-- component chunks -->";

/**
 * Asks for `urls` at the end of the page's head.
 *
 * A `modulepreload` starts the fetch during parsing and puts the module in the module map, so the
 * `import()` a catalog loader makes later resolves without a request. That is the whole point: it
 * turns a chain of round trips into one.
 */
export function withModulePreloads(html: string, urls: string[]): string {
  if (!urls.length) return html;

  const links = urls.map((url) => `<link rel="modulepreload" href="${url}">`).join("");
  const block = `${CHUNKS_MARKER}${links}`;

  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${block}</head>`) : `${block}${html}`;
}

/** The html without the block `withModulePreloads` added, so the shell template stays pristine */
export function withoutModulePreloads(html: string): string {
  const start = html.indexOf(CHUNKS_MARKER);
  if (start === -1) return html;

  const end = html.indexOf("</head>", start);

  return html.slice(0, start) + (end === -1 ? "" : html.slice(end));
}
