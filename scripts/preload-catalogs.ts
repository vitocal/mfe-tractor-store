import type { Plugin } from "vite";

/**
 * Asks the browser for the teams' catalogs while it is still fetching the shell.
 *
 * The shell fetches its teams at runtime (see `src/catalog.ts`), so their urls are known to
 * javascript and to nothing else. Without this, the browser runs the shell, and only then finds
 * out what to fetch - which puts the teams' catalogs, and with them every component on the page,
 * one round trip behind. A `modulepreload` link moves those fetches into the same round trip as
 * the shell's own script, and the `import()` that follows is then a module-map hit: exactly what
 * the shell had for free while the teams were bundled into it.
 *
 * On by default - `PRELOAD_MITIGATION=0` turns it off (see `vite.config.js`). It used to be the
 * other way round, on the strength of a measurement taken on localhost, where a round trip costs
 * nothing and so this could only ever look like noise. On a real connection the round trip it
 * removes is most of a navigation.
 *
 * This covers the catalogs, which every page needs and which nothing in the document names. The
 * chunks *behind* a catalog are per page, so the prerender links those instead - see
 * `component-chunks.ts`.
 */

/** Marks the block, so a build starting from a previous output replaces it rather than stacking */
const MARKER = "<!-- team catalogs -->";

export interface PreloadCatalogsOptions {
  /** The urls to preload, eg `/explore/dist/catalog.js` */
  catalogs: string[];
  /** Whether to add the links at all */
  enabled: boolean;
}

/** The html without the block a previous run added */
function withoutPreloads(html: string): string {
  const start = html.indexOf(MARKER);
  if (start === -1) return html;

  const end = html.indexOf("\n", start);

  return html.slice(0, start) + html.slice(end === -1 ? html.length : end + 1);
}

/** The links, as a block the marker can find again */
function preloadLinks(catalogs: string[]): string {
  const links = catalogs.map((url) => `<link rel="modulepreload" href="${url}">`).join("");

  return `${MARKER}${links}\n`;
}

/**
 * Adds the links to `index.html`.
 *
 * Every page is built from that html - the SSG writes its pages from the shell build (see
 * `scripts/ssg.ts`) - so one hook covers a prerendered page and a bare shell alike.
 */
export function preloadCatalogs({ catalogs, enabled }: PreloadCatalogsOptions): Plugin {
  return {
    name: "shell:preload-team-catalogs",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        const stripped = withoutPreloads(html);

        if (!enabled) return stripped;

        const block = preloadLinks(catalogs);

        return /<\/head>/i.test(stripped)
          ? stripped.replace(/<\/head>/i, `${block}</head>`)
          : `${block}${stripped}`;
      },
    },
  };
}

export default preloadCatalogs;