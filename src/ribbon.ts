/**
 * The ribbon that says how the page on screen was rendered, as a custom element.
 *
 * Only the shell knows. It either found this route's markup already in the document - a
 * prerendered page, so the pass did the work - or it rendered the route itself, which is what
 * `npm run dev` does and what a built site does for the routes no pass covers. So the ribbon
 * reports what the shell *saw*, not what a build was configured to do, and it flips as you
 * navigate between the two kinds of page.
 *
 * It is a custom element of the shell's own catalog (`./catalog.ts`), sitting in `index.html`
 * outside the stage, so re-rendering a route cannot take it with it. It says nothing until the
 * shell tells it a mode, because it cannot know: `styles.css` keeps it out of the way until then.
 */

/** Which mode produced the markup on screen: served prerendered, or rendered in the browser */
export type RenderMode = "server" | "client";

/** What each mode shows, and what it explains on hover */
const MODES: Record<RenderMode, { label: string; title: string }> = {
    server: {
        label: "server",
        title: "This page was served prerendered: the markup was already in the document.",
    },
    client: {
        label: "client",
        title: "This page was rendered in the browser, by the shell.",
    },
};

/** The element's tag. `index.html` carries it, and the shell's catalog loads it. */
export const RIBBON_TAG = "render-mode";

/**
 * The attribute the shell sets to say which mode the page was rendered in.
 *
 * `styles.css` colours the ribbon by it and hides the ribbon while it is unset, so a page can
 * never show a badge it was not told about.
 */
export const RIBBON_ATTRIBUTE = "mode";

/**
 * Says how the markup on screen was produced.
 *
 * The shell sets `mode` and the element does the rest: the label and the explanation follow the
 * attribute, so setting it before the element upgrades works too.
 */
export class RenderModeRibbon extends HTMLElement {
    static get observedAttributes(): string[] {
        return [RIBBON_ATTRIBUTE];
    }

    /** Which mode the page on screen was rendered in, or null until the shell says */
    get mode(): RenderMode | null {
        return this.getAttribute(RIBBON_ATTRIBUTE) as RenderMode | null;
    }

    set mode(mode: RenderMode | null) {
        if (mode) this.setAttribute(RIBBON_ATTRIBUTE, mode);
        else this.removeAttribute(RIBBON_ATTRIBUTE);
    }

    connectedCallback(): void {
        this.render();
    }

    attributeChangedCallback(): void {
        this.render();
    }

    private render(): void {
        const mode = this.mode;
        const explained = mode ? MODES[mode] : undefined;

        // An unknown or missing mode leaves the element blank, so it can not guess.
        this.textContent = explained?.label ?? "";
        this.title = explained?.title ?? "";
    }
}

if (!customElements.get(RIBBON_TAG)) {
    customElements.define(RIBBON_TAG, RenderModeRibbon);
}

export default RenderModeRibbon;
