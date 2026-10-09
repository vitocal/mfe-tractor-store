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
 * to the stylesheet that module was compiled into. Each build names its tags its own way -
 * a team through `catalog.ts`, the shell's design system through `components/catalog.ts` -
 * so a build says how, and this module does the rest.
 */

/**
 * A Vite build manifest: the modules a build emitted, the file each one compiled into, the
 * stylesheets that file needs, and the manifest keys it imports.
 *
 * `imports` is the other half of "what does this page cost": a component's chunk is only reachable
 * through the catalog's `() => import(…)` loader, so the manifest is the one place the chain from a
 * tag to every file behind it is written down. See `component-chunks.ts`.
 *
 * `dynamicImports` is declared so that it is clear it is *not* followed: those are the components
 * a chunk loads lazily itself, which are the page's business only if the page uses them.
 */
export type Manifest = Record<
  string,
  { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }
>;

/** A build that names custom elements, and the manifest of what it emitted */
export interface ComponentBuild {
    /** The tag a module compiles into, or null when the module is not a component */
    tagFor(module: string): string | null;
    /** What the build emitted, keyed by module path */
    manifest: Manifest;
    /**
     * Where the build is served from, in front of the stylesheet paths its manifest declares.
     *
     * Empty for the shell's own build, which is the site itself. A team's build is served at
     * `/<team>/dist/`, because that is where its own catalog is fetched from and resolves its
     * stylesheets against - see `stage-team-assets.ts`.
     */
    urlPrefix: string;
}

/**
 * A team build.
 *
 * `catalog.ts` turns `pages/category.ce.tsx` into `<explore-pages-category>`: prefix the
 * namespace, drop the custom element extension, join the path with dashes.
 */
export function teamBuild(prefix: string, extension: string, manifest: Manifest): ComponentBuild {
    return {
        manifest,
        urlPrefix: `${prefix}/dist/`,
        tagFor(module) {
            if (!module.endsWith(extension)) return null;

            const [type, filename = ""] = module.split("/");

            return `${prefix}-${type}-${filename}`.replace(extension, "");
        },
    };
}

/**
 * The shell's design system.
 *
 * `components/catalog.ts` resolves `ds-*` to `./<name>.tsx`, so `<ds-button>` is
 * `src/components/button.tsx`.
 */
export function designSystemBuild(manifest: Manifest): ComponentBuild {
    return {
        manifest,
        urlPrefix: "",
        tagFor(module) {
            const component = /^src\/components\/([^/]+)\.tsx$/.exec(module);

            return component ? `ds-${component[1]}` : null;
        },
    };
}

/**
 * Custom element tags in a chunk of html.
 *
 * A tag is a name with a dash in it that no html element has - the same rule the browser and
 * `ce-autoloader` use to decide that an element is somebody's component. The prerender uses it
 * to find the components a page has to link styles for.
 */
export function tagsIn(html: string): string[] {
    return [...new Set([...html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)].map(([, tag]) => tag))];
}

/**
 * `assets/index.css` -> `/assets/index.css`, so the url resolves from any page depth.
 *
 * `prefix` is where the build is served from: empty for the shell, `explore/dist/` for a team -
 * whose stylesheets are emitted into its own build and fetched from there, not from the shell's.
 *
 * Exported because a chunk url needs the same answer as a stylesheet url - see
 * `component-chunks.ts`, which resolves the other half of a page's cost from the same manifests.
 */
export function toUrl(file: string, prefix = ""): string {
    return `/${prefix}${file.replace(/^\/+/, "")}`;
}

/** tag -> the stylesheets that tag needs, for every component the given builds emit */
export function stylesByTag(builds: ComponentBuild[]): Map<string, string[]> {
    const index = new Map<string, string[]>();

    for (const build of builds) {
        for (const [module, output] of Object.entries(build.manifest)) {
            // A manifest also lists plain modules - `routes.ts`, the shared chunks. A build's
            // `tagFor` answers null for those: only what its catalog globs can become a tag.
            const tag = build.tagFor(module);

            if (tag) index.set(tag, (output.css ?? []).map((file) => toUrl(file, build.urlPrefix)));
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
