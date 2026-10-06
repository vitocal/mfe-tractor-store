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
   fire without layout, so those components never upgrade in a render. Stylesheets have to be
   answered from memory (`disableCSSFileLoading: true` hangs). `document.write` order matters.
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
- Build-order coupling: teams before the shell, the shell before the pass.
- Only the routes you enumerate exist. Everything else falls back to the shell and is rendered
  in the browser, so you run both modes at once.
- Cross-team components cannot be expanded by a team's own pass (explore's pass cannot render
  the checkout team's mini-cart), which leaves those placeholders to the browser.

### Where the trade-offs landed here

**SSG buys the first paint and the crawler, and charges you a marker, a manifest and a build
order.** For a store whose every page is assembled from lazy components, that is a good trade:
the page is now correct before a byte of javascript runs, and the javascript budget did not
change.

The two modes are not exclusive, and this repo ends up using both - explore is prerendered,
decide and checkout are rendered in the browser. That is not a wart to be engineered away, it
is what adopting SSG incrementally looks like. The one rule that makes it coherent is the
`data-prerendered` marker: whichever mode produced the document, the shell can tell whether the
markup is already there.

## Measuring this yourself

```bash
npm run preview:ssg
```

To see the first paint as the browser sees it, park the shell's javascript
(`mv dist/index.js /tmp/`) and read computed styles at `DOMContentLoaded` - that is pure html
and css, which is what render-blocking stylesheets actually guarantee. To watch the pass work,
`SSG_DEBUG=1 npm run ssg` logs every asset the render asks for.

Open gaps are listed in [README.md](./README.md#known-gaps).
