import { createRouter } from "./router";
import type { RenderMode } from "./components/ribbon";

import routes from "./routes";

/**
 * The SPA shell.
 *
 * `index.html` includes this script only in the SPA build - see the `%SPA_ROUTER%` placeholder
 * and `vite.config.js` - so a prerendered page, and the SSR bundle, never carry it. It renders
 * whatever route the url names, into the same stage `app.ts` boots the loader for.
 *
 * `app.ts` does nothing on a bare shell (no `data-prerendered` marker), which is exactly the
 * page this runs on, so the two scripts do not fight over the stage.
 */

const stage = document.querySelector("vi-router");

const notFound = { name: "not-found", path: "*", render: () => `<h1>404 Not Found</h1>` };
const router = createRouter(routes, { notFound });

stage.innerHTML = router.render(location.pathname + location.search)?.html ?? "";


/**
 * Says how the markup on screen was produced - see `./components/ribbon.ts`. The ribbon is the shell's own
 * custom element (`<render-mode>`), carried by `index.html`; only the shell knows the mode, so it
 * is set here.
 */
function showMode(mode: RenderMode): void {
    document.querySelector("render-mode")?.setAttribute("mode", mode);
}
showMode("client");
