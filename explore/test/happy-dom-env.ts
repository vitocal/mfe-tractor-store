/**
 * Test environment for the explore team.
 *
 * Registers a Happy DOM window as the global environment *before* any test (or
 * the module it imports) is loaded, so custom elements can be registered and
 * rendered outside a browser.
 *
 * Loaded via `node --import ./test/happy-dom-env.ts --test ...`, see the
 * "test" script in package.json.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({
  url: "http://localhost:4002",
  width: 1280,
  height: 900,
});

/** The (untyped) handle `GlobalRegistrator` exposes on the global scope */
type HappyDOMGlobal = {
  happyDOM: {
    settings: {
      fetch: {
        interceptor?: {
          beforeAsyncRequest?: (context: {
            request: { url: string };
            window: { Response: new (body?: string, init?: unknown) => unknown };
          }) => Promise<unknown> | unknown;
        };
      };
    };
  };
};

/**
 * The team catalog is built by Vite, so loading a component runs its preload
 * helper, which fetches the component CSS through a `<link rel="stylesheet">`.
 * Happy DOM refuses the `file://` URL those links resolve to, which would make
 * the component import reject. Serve the stylesheets from memory instead - these
 * tests assert markup, not styling.
 */
const { happyDOM } = window as unknown as HappyDOMGlobal;

happyDOM.settings.fetch.interceptor = {
  beforeAsyncRequest: ({ request, window: domWindow }) => {
    if (request.url.split("?")[0].endsWith(".css")) {
      return new domWindow.Response("", { headers: { "content-type": "text/css" } });
    }
  },
};

/**
 * Belt and braces: if a preload fails anyway, Vite dispatches this event before
 * re-throwing. Preventing it keeps the component import alive.
 */
window.addEventListener("vite:preloadError", (event) => event.preventDefault());

