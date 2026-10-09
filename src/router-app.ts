import { createRouter } from "./router";

import { routes } from "./routes";

const stage = document.querySelector("vi-router");
const notFound = { name: "not-found", path: "*", render: () => `<h1>404 Not Found</h1>` };

/**
 * Renders the route the url names.
 *
 * A team's route table is fetched from that team's build (see `./routes.ts`), so this is
 * asynchronous - and, like the catalog in `./app.ts`, it is not awaited in the module body: this
 * script is render-blocking, and the shell's html paints without waiting for the teams.
 */
async function render(): Promise<void> {
    const router = createRouter(await routes(), { notFound });

    stage.innerHTML = router.render(location.pathname + location.search)?.html ?? "";
}

render();
