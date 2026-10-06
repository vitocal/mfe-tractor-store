/**
 * Which stylesheet a custom element needs, resolved at build time.
 *
 * Lazy loading keeps the styles honest on its own: the bundler's preload helper fetches a
 * component's stylesheet and *waits for it* before the element is defined, so nothing is
 * ever painted unstyled. SSG breaks that guarantee - the markup is in the document from
 * the first byte, while the stylesheet would only arrive with the javascript. The page
 * paints unstyled, then reflows once the styles land.
 *
 * So the prerender has to know the styles up front. The authoritative source is the build
 * manifest Vite writes next to a build (`manifest: true`): it maps every module it emitted
 * to the stylesheet that module was compiled into. A module becomes a tag exactly the way
 * the team's own `catalog.ts` names it - `pages/category.ce.tsx` in the `explore` build is
 * `<explore-pages-category>`.
 */

/** A Vite build manifest: the modules a build emitted, and the stylesheets they need */
export type Manifest = Record<string, { file: string; css?: string[] }>;

/** A build that names custom elements, and the manifest of what it emitted */
export interface ComponentBuild {
    /** The tag prefix, eg `explore` in `<explore-pages-home>` */
    prefix: string;
    /** The custom element extension the build uses, eg `.ce.tsx` */
    extension: string;
    /** What the build emitted, keyed by module path */
    manifest: Manifest;
}

/** The custom element tags the given html uses, in order of first appearance */
export function tagsIn(html: string): string[] {
    return [...new Set([...html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)].map(([, tag]) => tag))];
}

/** The tag a module is built into, the way `catalog.ts` derives it */
export function tagForModule({ prefix, extension }: ComponentBuild, module: string): string {
    const [type, filename = ""] = module.split("/");

    return `${prefix}-${type}-${filename}`.replace(extension, "");
}

/** `assets/index.css` -> `/assets/index.css`, so the url resolves from any page depth */
function toUrl(file: string): string {
    return `/${file.replace(/^\/+/, "")}`;
}

/** tag -> the stylesheets that tag needs, for every component the given builds emit */
export function stylesByTag(builds: ComponentBuild[]): Map<string, string[]> {
    const index = new Map<string, string[]>();

    for (const build of builds) {
        for (const [module, output] of Object.entries(build.manifest)) {
            // A manifest also lists plain modules - `routes.ts`, the shared chunks. Only the
            // components the team's `catalog.ts` globs can become a tag.
            if (!module.endsWith(build.extension)) continue;

            index.set(tagForModule(build, module), (output.css ?? []).map(toUrl));
        }
    }

    return index;
}

/**
 * Tags that name one of the builds but that no build declares.
 *
 * A tag outside every namespace is somebody else's business - the stage (`vi-router`) is
 * not in a catalog, and a third party may define its own elements later. A tag *inside* a
 * namespace that nothing declares is a build that did not run, or a renamed convention, and
 * it would ship a page whose component has no styles at all.
 */
export function unknownTags(index: Map<string, string[]>, tags: string[], prefixes: string[]): string[] {
    return tags.filter(
        (tag) => prefixes.some((prefix) => tag.startsWith(`${prefix}-`)) && !index.has(tag),
    );
}

export interface PageStyles {
    /** Stylesheet urls, sorted */
    urls: string[];
    /** Components the page uses that their build declares no stylesheet for */
    unstyled: string[];
}

/**
 * The stylesheets the given tags need.
 *
 * A tag the index does not know is not reported: the stage (`vi-router`) and third party
 * elements are not the builds' business. A tag the index *does* know but that carries no
 * stylesheet is reported, because a component that lost its styles is exactly the failure
 * this is meant to catch.
 */
export function stylesForTags(index: Map<string, string[]>, tags: string[]): PageStyles {
    const urls = new Set<string>();
    const unstyled: string[] = [];

    for (const tag of tags) {
        const css = index.get(tag);

        if (css === undefined) continue;
        if (!css.length) unstyled.push(tag);

        for (const url of css) urls.add(url);
    }

    return { urls: [...urls].sort(), unstyled: unstyled.sort() };
}

/**
 * Marks the stylesheets the prerender links.
 *
 * The marker earns its keep on the second run: the pass writes the root page over the shell
 * html, so its next input is its own output, and the marker is what tells the two apart.
 */
const STYLES_MARKER = "<!-- component styles -->";

/**
 * Links the stylesheets at the end of the page's head.
 *
 * They go last on purpose: a team's component styles must win over the shell's base styles,
 * which is also the order the browser ends up with when it appends the same links while
 * loading components lazily.
 */
export function withStylesheets(html: string, urls: string[]): string {
    if (!urls.length) return html;

    const links = urls.map((url) => `<link rel="stylesheet" href="${url}">`).join("");
    const block = `${STYLES_MARKER}${links}`;

    return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${block}</head>`) : `${block}${html}`;
}

/** The html without the block `withStylesheets` added, so the shell template stays pristine */
export function withoutStylesheets(html: string): string {
    const start = html.indexOf(STYLES_MARKER);
    if (start === -1) return html;

    const end = html.indexOf("</head>", start);

    return html.slice(0, start) + (end === -1 ? "" : html.slice(end));
}
