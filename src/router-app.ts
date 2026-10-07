import { createRouter } from "./router";
import routes from "./routes";
import { createRibbon } from "./ribbon";

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

/**
 * Says how the markup on screen was produced - see `./ribbon.ts`. `app.ts` may have made the
 * ribbon already, so `createRibbon` reuses it rather than appending a second one.
 */
const showMode = createRibbon(document.body);

const notFound = { name: "not-found", path: "*", render: () => `<h1>404 Not Found</h1>` };
const router = createRouter(routes, { notFound });

stage.innerHTML = router.render(location.pathname + location.search)?.html ?? "";
showMode("spa");
