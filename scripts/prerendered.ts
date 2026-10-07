import type { Route } from "../src/router.ts";

/**
 * The contract between a prerendered page and the shell.
 *
 * A page a pass prerendered carries the route it was rendered for, so the shell can tell
 * "this document already holds this route's markup" apart from "this is a bare shell". Without
 * it the shell renders the same route a second time, over the markup the pass just produced:
 * a flash for the user, and the prerender's work thrown away.
 *
 * The attribute also answers "was this page prerendered, and for what?" straight from the
 * source, which is worth a lot when debugging an SSG build.
 */

/** The attribute, on `<html>`, carrying the route a document was prerendered for */
export const PRERENDERED_ATTRIBUTE = "data-prerendered";

/** The html without a prerendered marker, so marking twice can not stack two of them */
function unmarkPrerendered(html: string): string {
    return html.replace(new RegExp(`\\s*${PRERENDERED_ATTRIBUTE}="[^"]*"`, "gi"), "");
}

/** Marks `html` as prerendered for `path`, replacing a marker that is already there */
export function markPrerendered(html: string, path: string): string {
    const marker = `${PRERENDERED_ATTRIBUTE}="${path.replace(/"/g, "&quot;")}"`;

    return unmarkPrerendered(html).replace(
        /<html([^>]*)>/i,
        (_match, attributes: string) => `<html${attributes} ${marker}>`,
    );
}

/** The route `html` was prerendered for, or null when it is a bare shell */
export function prerenderedRoute(html: string): string | null {
    const marker = new RegExp(`${PRERENDERED_ATTRIBUTE}="([^"]*)"`, "i").exec(html);

    return marker ? marker[1] : null;
}

/* -------------------------------------------------------------------- route -- */

/** The global a prerendered page carries its route on, so the shell can re-render it */
export const PRERENDERED_ROUTE_GLOBAL = "__prerenderedRoute";

/** Markers around the route script, so a re-run can drop it and the shell template stays pristine */
const ROUTE_START = "<!-- prerendered route -->";
const ROUTE_END = "<!-- /prerendered route -->";

/**
 * The route `html` was rendered for, as a script tag the page carries in its head.
 *
 * The shell needs the route when a query string makes the prerendered html wrong - `?sku=` picks
 * a different variant of a product page. A route is a pattern to match the url and a `render` to
 * redo the markup; the pattern travels as data and the `render` as source, through
 * `Function.prototype.toString`. That is exact for the pure string builders a route table holds,
 * and it is what lets the shell re-render *any* team's page without importing any team's routes.
 */
export function embedRoute(route: Route): string {
    const name = JSON.stringify(route.name);
    const path = JSON.stringify(route.path);

    return `<script>globalThis.${PRERENDERED_ROUTE_GLOBAL}={name:${name},path:${path},render:${route.render.toString()}}</script>`;
}

/** Adds the route script to the end of the page's head */
export function withRoute(html: string, route: Route): string {
    const block = `${ROUTE_START}${embedRoute(route)}${ROUTE_END}`;

    return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${block}</head>`) : `${block}${html}`;
}

/** The html without the block `withRoute` added, so the shell template stays pristine */
export function withoutRoute(html: string): string {
    const start = html.indexOf(ROUTE_START);
    const end = html.indexOf(ROUTE_END);

    if (start === -1 || end === -1) return html;

    return html.slice(0, start) + html.slice(end + ROUTE_END.length);
}
