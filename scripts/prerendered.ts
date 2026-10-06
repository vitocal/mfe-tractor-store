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
