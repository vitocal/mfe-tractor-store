/**
 * Custom element tags in a chunk of html.
 *
 * A tag is a name with a dash in it that no html element has - the same rule the browser and
 * `ce-autoloader` use to decide that an element is somebody's component. The shell uses this
 * to preload the elements a page is about to show; the SSG pass uses it to find the components
 * it has to link styles for.
 */
export function tagsIn(html: string): string[] {
    return [...new Set([...html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)].map(([, tag]) => tag))];
}
