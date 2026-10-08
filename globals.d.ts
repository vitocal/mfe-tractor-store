import './explore/types'

/**
 * The values `vite.config.js` injects through `define`.
 *
 * Both are the teams' published builds as urls. The shell fetches them at runtime instead of
 * bundling them - see `src/catalog.ts` and `src/routes.ts` for why - and it can not read the list
 * itself: `scripts/ssg-teams.ts`, which holds it, reads the filesystem.
 */
declare global {
    interface ImportMetaEnv {
        /** The urls of the teams' catalogs, eg `/explore/dist/catalog.js` */
        readonly TEAM_CATALOGS: string[];
        /** The urls of the teams' route tables, eg `/explore/dist/routes.js` */
        readonly TEAM_ROUTES: string[];
    }

    interface Window {
        /** The shell's loader, exposed for poking at a page by hand - see `src/app.ts` */
        registry?: unknown;
    }
}