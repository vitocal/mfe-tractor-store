/**
 * The ribbon that says how the page on screen was rendered.
 *
 * Only the shell knows. It either found this route's markup already in the document - a
 * prerendered page, so the pass did the work - or it rendered the route itself, which is what
 * `npm run dev` does and what a built site does for the routes no pass covers. So the ribbon
 * reports what the shell *saw*, not what a build was configured to do, and it flips as you
 * navigate between the two kinds of page.
 *
 * It is mounted at runtime on purpose: the html a crawler gets should be the app, not a badge
 * about how the app was made.
 */

/** Which mode produced the markup on screen */
export type RenderMode = "ssg" | "spa";

/** What each mode shows, and what it explains on hover */
const MODES: Record<RenderMode, { label: string; title: string }> = {
  ssg: {
    label: "SSG",
    title: "This page was served prerendered: the markup was already in the document.",
  },
  spa: {
    label: "SPA",
    title: "This page was rendered in the browser, by the shell.",
  },
};

/** The class the ribbon carries. `styles.css` is written against it. */
export const RIBBON_CLASS = "mode-ribbon";

/**
 * Adds the ribbon to `host` and returns a function that sets its mode.
 *
 * The element is created once and updated in place: the shell re-renders the stage on every
 * navigation, so the ribbon lives outside it, on `<body>`.
 */
export function createRibbon(host: HTMLElement): (mode: RenderMode) => void {
  const ribbon = document.createElement("div");

  ribbon.className = RIBBON_CLASS;
  host.append(ribbon);

  return (mode) => {
    const { label, title } = MODES[mode];

    ribbon.dataset.mode = mode;
    ribbon.textContent = label;
    ribbon.title = title;
  };
}
