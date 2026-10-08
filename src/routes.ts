import type { Route } from "./router";

/**
 * The urls the teams publish their route tables at, handed in by the build.
 *
 * The same story as `./catalog.ts`: `scripts/ssg-teams.ts` holds the list, the shell can not read
 * it, and `vite.config.js` passes the urls through `define`.
 */
const TEAM_ROUTES = import.meta.env.TEAM_ROUTES;

/** A team's route table, fetched from the build the team published - see `./catalog.ts` */
async function teamRoutes(url: string): Promise<Route[]> {
    const module = (await import(/* @vite-ignore */ url)) as { default?: Route[] };

    return module.default ?? [];
}

/**
 * Every team's routes, in the order the teams are listed.
 *
 * The SPA router is the only consumer, and it is the only place the shell ever needed a team's
 * route table: a prerendered page carries the route it was rendered for as *source* instead (see
 * `scripts/prerendered.ts`), which is what keeps a page that never runs the router free of them.
 */
export async function routes(): Promise<Route[]> {
    const tables = await Promise.all(TEAM_ROUTES.map(teamRoutes));

    return tables.flat();
}

export default routes;