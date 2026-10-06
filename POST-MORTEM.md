# Post-mortem: prerendering a lazily loaded micro-frontend

This is the write-up of one piece of work: adding a real static generation pass to a store
whose pages are assembled in the browser from lazily loaded web components, and fixing the
first-paint problems that came out of it. It covers what broke, what we learned, and where
the two rendering modes actually land.

It is deliberately specific. Every claim below was measured on this repo, and the numbers are
the ones the tools printed.

## The goal

Three things, in order:

1. Kill the first-render layout shift on `/`, `/products`, `/products/:category` and
   `/product/:id`.
2. Add an SSG pass that produces pages a crawler can read, **without** hand-written templates
   that drift from the app.
3. Document what SPA and SSG each mean here.

## What broke

### 1. The prerendered pages had no stylesheets

The symptom: the prerendered page painted as "mostly text and a blank state", then restyled.

The cause was not in the SSG pass at all - it was a guarantee we had been relying on without
naming it. **Vite's preload helper fetches a component's stylesheet and waits for it before
the element is defined.** So in SPA mode a component can never be painted unstyled: the css
arrives before the element exists. Lazy loading was doing double duty as a CSS guarantee.

SSG broke it by construction. The markup was now in the document from the first byte, while
the stylesheet would still only arrive with the javascript. The render was the proof: with
`SSG_DEBUG=1`, the prerender asked for **exactly one** stylesheet - the shell's own:

```
[ssg] fetch /assets/index-D-QHPsXj.css     <- the shell's, and that was all
[ssg] fetch /explore/dist/chunks/category.ce.js
[ssg] fetch /explore/dist/chunks/header.ce.js
```

Why: the render's setup script imported the built chunks **directly**, and the only thing that
knows a chunk's stylesheet is the catalog's `__vite__mapDeps` preload map. Importing the chunk
bypasses it, so the css was never requested.

**Lesson.** When you add a build-time renderer to a system whose runtime does the same job, the
runtime's *implicit* guarantees are what you lose - not its features. The lazy loader's "css
before define" was never written down as a contract, so nothing told us SSG had to
re-establish it.

### 2. The CSS bug did not show up as CLS

This is the one that cost the most time. The report was "blank state" and "blinking", so the
obvious instrument was a `layout-shift` observer. It read **~0.0001** both before and after the
fix, with a single shift attributed to `ds-button`.

The reason is that the earlier CLS work had reserved space for undefined elements
(`:where(:not(:defined))` skeletons, the header's `min-height`, the mini-cart's 138×138 box).
So the layout never moved - the page was simply **painted wrong**: the product grid collapsed
to a vertical stack, and then snapped into a grid. No shift was recorded, because the boxes
were already the right size.

Measuring the thing the user actually sees - the *first paint* - showed it immediately. With
the shell's javascript parked, so only html and css could run:

| `/products/classic` first paint | before  | after                 |
| ------------------------------- | ------- | --------------------- |
| stylesheets                     | 1       | 5                     |
| css rules                       | 89      | 171                   |
| `.e_CategoryPage_list` display  | `block` | `grid`                |
| `grid-template-columns`         | `none`  | `394.812px 394.812px` |

**Lesson.** FOUC and CLS are different failures and need different instruments. "Reserve the
space" fixes shifts; it does nothing for a wrong paint. If the report is visual, measure the
paint.

### 3. The pass was not idempotent, and it leaked styles across pages

The SSG writes the root page **over** the shell html (`dist/index.html` is both the template
and the `/` page). So on a second run, the pass's input is its own output. The first version
appended its stylesheet links, which meant:

- every link appeared **twice**, and
- worse, `/products/classic` inherited `/`'s `home-*.css` and `recommendations-*.css` - the
  per-route precision was quietly gone.

`fillStage()` had made the *stage* idempotent; nothing had done the same for the head.

**Lesson.** A build pass that overwrites its own template needs an explicit marker for "the
part I added". This is the kind of bug that never shows up in a single build and always shows
up in CI or on the second deploy. Verify idempotency by running the pass twice **without a
rebuild in between** and diffing.

### 4. The shell threw the prerendered markup away

`renderRoute()` did `stage.innerHTML = …` unconditionally. On a prerendered page that deleted
the markup the pass had just produced and drew the same thing again - a flash, and the pass's
work wasted.

It was also confusing to read, because a click listener in the same file *looked* like it did
client-side navigation - its body was commented out, so it ran on every click and did nothing.
That dead listener, plus a router that was still shipped and still ran, made it look like SSG
mode did local navigation. It didn't, but nothing said so.

The fix is a marker: a prerendered page carries `data-prerendered="/the/route"` on `<html>`,
and the shell skips the render when the path matches. Measured:

| page                               | `data-prerendered`  | stage markup replaced?           |
| ---------------------------------- | ------------------- | -------------------------------- |
| `/products/classic` (prerendered)  | `/products/classic` | **no**                           |
| `/product/CL-08` (not prerendered) | `/` (the shell)     | **yes** - the router rendered it |

**Lesson.** Two systems producing the same markup need an explicit way to tell "already done"
from "not done yet". And the router has to stay: a prerendered page links to routes no pass
prerenders, so it is the fallback, not dead weight.

### 5. Only one team was prerendered - and extending it broke every page

The pass covered explore alone. Extending it to decide and checkout should have been config:
each team already had a route table and a catalog. Instead every page timed out, or rendered as
a bare placeholder. Four separate causes, all of them invisible in a browser:

**a. A team's catalog is where its components are *defined*.** The pass imported the built
`chunks/*.ce.js` directly. That works for Preact and Svelte, whose components call `register()`
when their module is imported. Vue does not: the catalog is what calls
`defineCustomElement(module.default)` and produces the constructor. So decide's chunks imported
cleanly and defined nothing, and `<decide-pages-product>` stayed a placeholder with its own
route markup inside it - a 1.9 kB page where the others were 8-14 kB. The fix was to stop
importing chunks and load through the catalogs instead, which is what the browser's loader does
anyway.

**b. A module happy-dom cannot compile does not fail - it hangs.** The built catalog contains
`import.meta.resolve ? import.meta.resolve(e) : new URL(e, import.meta.url).href`. happy-dom's
module compiler cannot handle it, and a module that never finishes compiling never rejects
either: the render waits for an import that will never resolve, and every page spends its full
30 second timeout. This is the single most expensive failure mode in the whole exercise - it
looks like slowness, not breakage, and it reports nothing.

**c. The preload helper is actively hostile to a render.** Every catalog loader is wrapped in
`preload(() => import(chunk), deps, url)`, which fetches the component's stylesheet and *waits
for it* before importing the module. In a render the stylesheets are linked from the manifest,
so that `<link>` is never going to load - and the loader sits on it while the page is
serialized, so the components define *after* the html is written.

Both b and c are fixed the same way: the interceptor rewrites the module it serves, the way it
already did for the mixed default/named import. `import.meta.resolve` is replaced with the
fallback it guards (identical resolution), and `()=>n(()=>import("…"),deps,url)` becomes
`()=>import("…")`. Only the render sees the rewritten source.

**d. The decide route emitted invalid html.** Its render returned
`<decide-pages-product id=${id} sku=${sku}></decide-pages-product id=${id} sku=${sku}>` - an
unquoted attribute that renders the string `"undefined"` when there is no sku, and an end tag
carrying attributes, which the parser treats as *text*. In a browser this is invisible: the
component replaces its own children when it renders. In a render it is the difference between
an element and an element with a stray text node, and it is what the pass had been quietly
serving.

**Lesson.** A build-time renderer turns every implicit runtime behaviour into an explicit
dependency, and it fails *quietly*: a hang instead of an error, a placeholder instead of a
crash, invalid html instead of a broken layout. When a render is wrong, isolate it down to the
smallest html string that reproduces it - the `ceRenderToString` entry point exists for exactly
that, and it is what found all four of these.

### 6. A prerendered page with state in it showed the state twice

`/checkout/cart` is a per-user page: it renders whatever is in `localStorage`. Prerendering it
ships a build-time snapshot - an empty basket - which is honest for the first paint and useless
for a crawler, and it has to be replaced the moment the component mounts.

It wasn't. Measured on the built page, after adding something to the cart:

|                                    | prerendered | live                                |
| ---------------------------------- | ----------- | ----------------------------------- |
| `<checkout-pages-cart>` children    | 1           | **2**                               |
| `.c_CartPage h2`                    | "Basket"    | `["Basket", "Basket"]`              |
| `.c_CartPage__total`                | `Total: $0 Ø` | `["Total: $0 Ø", "Total: $5100 Ø"]` |

The user reads the *first* ones, so the cart said "No items in cart".

The cause is a difference between the three frameworks that nothing had forced into the open:
**Svelte mounts a custom element by appending into its host**, while Preact and Vue replace it.
Explore and decide were fine - one child each, same check - and only checkout, the Svelte team,
duplicated.

Svelte 5's `customElement` option has an `extend` hook, which runs before the component mounts
and is the one moment the host can be emptied. `adoptPrerenderedMarkup` clears it (there is no
shadow root on any of these) and then calls the class's own `connectedCallback`, so the mount
itself is untouched. It is applied to all seven checkout elements.

**Lesson.** "The component upgrades the prerendered markup" is not a property of SSG, it is a
property of the *framework* - and a page assembled from three of them has three answers, one of
which silently appends. The other lesson is where to look: this was invisible in the build (31
pages, no errors) and invisible in the pass's output (the markup was correct). It only showed up
by counting nodes in the browser.

## What we learned

1. **The build manifest is the answer to "which css does this component need".** Not filenames,
   not parsing bundles. `manifest: true` gives an authoritative module → stylesheet map:
   `pages/category.ce.tsx` → `assets/category-LUucyYPK.css`. It took one line of config and it
   is exactly what SSR frameworks read too.
2. **Scope the css to what is in the document**, not to what the browser would fetch. Those
   differ: the browser only fetched the footer's css when the footer scrolled into view
   (`loading="visible"`), but the footer's *markup* was already served - so its css had to be
   linked anyway. Resolving from the markup's tags got this right by construction.
3. **Total css was 22.4 kB raw / 4.5 kB gzipped for all 17 stylesheets.** Worth knowing before
   building machinery: for a store this size, "link everything" would have been a defensible
   answer. We did per-route anyway because it is the honest one for a micro-frontend, and the
   numbers made it cheap to be honest.
4. **A renderer's configuration cannot carry functions to a worker.** `ServerRenderer` clones
   its config into a worker, so the fetch interceptor (a function) forced
   `worker: { disable: true }`. Anything passed through a worker boundary has to be data.
5. **Headless DOMs need their environment faked, deliberately.** `loading="visible"` can never
   fire without layout, so those components never upgrade in a render. Stylesheet *loading* has
   to be off (a render links its own), but switching it off alone makes every preload hang, so
   `handleDisabledFileLoadingAsSuccess` has to come with it. `document.write` order matters.
   Every one of these is a place where the render diverges from the browser.
6. **Verify with the real build artifacts, not fixtures.** The test that matters most here is
   the drift test: every tag the *built* explore catalog registers must resolve from the *real*
   manifest. It costs nothing and it fails the moment someone renames a convention.
7. **Guards beat documentation for silent failures.** The pass now throws when a page uses a
   component no build declares, and warns when a component has no stylesheet. A page that
   quietly ships unstyled is worse than a failed build.
8. **Check what the runtime already guarantees before reimplementing it.** The click listener
   that looked like client-side navigation had been a no-op for a while. Nobody noticed,
   because the app worked: full document navigations land on prerendered pages, which is what
   the cross-document view transitions want anyway. Dead code that reads as intent is worse
   than no code.

## SSG vs SPA, honestly

Both modes load the same components from the same catalogs. The difference is when the markup
is produced, and everything else follows from that.

### SPA (one document, rendered in the browser)

**Pros**

- One build, one html file, one entry. Nothing to keep in sync.
- The css guarantee is free: the preload helper fetches a stylesheet before it defines the
  element, so nothing is ever painted unstyled.
- No build step between a change and the page, which is why it is the dev mode.
- Navigation can be client-side if you want it, with same-document view transitions.

**Cons**

- A crawler gets an empty stage. SEO depends entirely on the crawler executing javascript.
- The page is blank until the javascript lands, and every route pays that again.
- The first paint is only as good as the skeleton screens: whatever the markup does not
  reserve, the user watches move.
- Errors are discovered in the browser, at runtime.

### SSG (markup at build time, still lazily hydrated)

**Pros**

- Crawlers and the first paint get real markup. The first paint is styled and complete, and it
  costs no javascript at all.
- The components still upgrade in place, so interactivity and code-splitting are unchanged.
- The prerender uses the *built* components, so it cannot drift from the app: the same chunks
  the browser loads produced the file.
- Failures are build failures - an empty stage, an undeclared component, a missing manifest.
- Pairs well with cross-document view transitions: navigation lands on real markup, so the
  transition has something to morph to.

**Cons**

- The css has to be re-established by hand. That is the manifest work above.
- A second source of truth for the markup, so you need the "already rendered" marker or the
  shell fights the pass.
- A prerendered page is a snapshot, and a page whose content depends on the visitor (the cart)
  is snapshotted empty. That is fine for the first paint and for a crawler, but the component
  has to *replace* it on mount, which each framework does differently.
- Build-order coupling: teams before the shell, the shell before the pass.
- Only the routes you enumerate exist. Everything else falls back to the shell and is rendered
  in the browser, so you run both modes at once.
- Components the render can not load stay placeholders. The shell's design system is the one
  left: its chunks import the shell entry, which the render must not boot, so `<ds-button>`
  waits for the browser.
- The render needs its own module rewrites (below). Every one of them is a happy-dom
  limitation, but they are still render-only behaviour that has to be maintained.

### Where the trade-offs landed here

**SSG buys the first paint and the crawler, and charges you a marker, a manifest and a build
order.** For a store whose every page is assembled from lazy components, that is a good trade:
the page is now correct before a byte of javascript runs, and the javascript budget did not
change.

The two modes are not exclusive, and this repo ends up using both: the prerendered routes are
served as files, and every other route is rendered in the browser. That is not a wart to be
engineered away, it is what adopting SSG incrementally looks like. The one rule that makes it
coherent is the `data-prerendered` marker: whichever mode produced the document, the shell can
tell whether the markup is already there.

All three teams are prerendered now - 31 pages across explore, decide and checkout. A page uses
components from more than one team (a checkout page uses explore's header, a decide page uses
checkout's add to cart), and that is not a problem to solve but a consequence of loading every
team's catalog: the stylesheet index narrows the result back down per page.

## Measuring this yourself

```bash
npm run preview:ssg
```

To see the first paint as the browser sees it, park the shell's javascript
(`mv dist/index.js /tmp/`) and read computed styles at `DOMContentLoaded` - that is pure html
and css, which is what render-blocking stylesheets actually guarantee. To watch the pass work,
`CE_RENDER_TRACE=1 npm run ssg` logs every asset the render asks for, and `SSG_TRACE=1` traces
what it is waiting for. To isolate one component,
[`ceRenderToString`](./scripts/ce-render.ts) renders a single html string through the same
machinery the pass uses.

Open gaps are listed in [README.md](./README.md#known-gaps).
