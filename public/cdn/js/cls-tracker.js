/**
 * cls-tracker.js - find *which* elements shift, and when.
 *
 * A `layout-shift` PerformanceObserver tells you a page moved and roughly which nodes were
 * involved, but it reports what the browser decided to score: batched, attributed late, and blind
 * to a shift whose boxes were already the right size (see POST-MORTEM.md, "The CSS bug did not show
 * up as CLS"). When you are chasing a first-render shift - a component upgrading, a web font
 * swapping, a lazy chunk landing - what you want is the *timeline*: "at frame N this element was
 * here, at frame N+1 it was there".
 *
 * This snippet does exactly that, with no API and no timing model of its own:
 *
 *   1. it snapshots the *layout* box of every element on screen - position and size as the
 *      layout engine sees them, not the visual box `getBoundingClientRect()` returns (see
 *      `boxOf`, below: transforms are not layout shifts),
 *   2. it re-snapshots whenever the DOM changes (`onDomChanged`, a MutationObserver), the viewport
 *      resizes, or a transition/animation ends,
 *   3. it diffs the two snapshots and reports every element whose box moved or resized, with a
 *      CLS-shaped score, and calls out the outermost element that moved - the one worth fixing,
 *   4. it brackets the navigation with `pageswap` / `pagereveal` and reports the one thing a view
 *      transition cannot tell you about itself: an element it captured leaving the document while
 *      the transition is still running, which aborts the whole transition (see `casualties`).
 *
 * Cross-check the total against the real thing, which scores the same events without per-element
 * double counting:
 *
 *     new PerformanceObserver((l) => l.getEntries().forEach((e) => console.log(e.value, e.sources)))
 *       .observe({ type: "layout-shift", buffered: true });
 *
 * Load it before the document runs, so it catches the first paint:
 *
 *     const s = document.createElement("script");
 *     s.src = "/cdn/js/cls-tracker.js";
 *     document.documentElement.append(s);
 *
 * ...or paste the whole file into the console - it starts on its own.
 *
 *   __cls.report()   // console.table of every shift, oldest first
 *   __cls.shifts     // the raw array
 *   __cls.vtReport() // console.table of the view transitions this document took part in
 *   __cls.transitions
 *   __cls.stop()     // stop watching
 *   __cls.start()    // start again
 *   __cls.reset()    // forget what was collected
 */
(() => {
  if (window.__cls) return window.__cls.start();

  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD", "NOSCRIPT", "TEMPLATE"]);
  const EPS = 0.5; // sub-pixel moves are not shifts

  const options = { onScreenOnly: true, reportMutations: true, trackTransitions: true };

  /** A stable, readable id per node, so a shift can be pointed at in the elements panel. */
  let seq = 0;
  const ids = new WeakMap();
  function idOf(el) {
    let id = ids.get(el);
    if (!id) ids.set(el, (id = `${el.tagName.toLowerCase()}${++seq}`));
    return id;
  }

  /**
   * `main#main.d_ProductPage > div.page` - enough to find the element by hand.
   *
   * Read through `getAttribute`, never through the properties. `className` and `id` are ordinary
   * DOM properties *and* plausible component props, and `preact-custom-element` defines a getter
   * for every name in the list a component observes:
   *
   *     get() { return this._vdom ? this._vdom.props[name] : this._props[name] }
   *
   * On an element that is defined but not upgraded yet - and again after `disconnectedCallback`,
   * which sets `_vdom = null` - neither branch has anything behind it, so reading the property
   * throws instead of returning the class. One such element anywhere in the document was enough to
   * take this whole tracker down, because the throw escaped the snapshot's frame callback.
   */
  function short(el) {
    const parts = [];

    try {
      for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
        const cls = (n.getAttribute("class") || "").trim();
        const id = n.getAttribute("id");
        const classes = cls ? "." + cls.split(/\s+/).slice(0, 2).join(".") : "";

        parts.unshift(n.tagName.toLowerCase() + (id ? `#${id}` : "") + classes);

        if (id) break;
      }
    } catch {
      // A label is never worth an exception: surviving the page is the whole point of this file.
      return parts.join(" > ") || el.nodeName.toLowerCase();
    }

    return parts.join(" > ");
  }

  const round = (n) => Math.round(n * 100) / 100;

  /**
   * The element's box in *layout* terms: where it sits in the document, and its border-box size.
   *
   * Deliberately not `getBoundingClientRect()`. That returns the *visual* box, which includes
   * transforms - and `translate` is exactly how this app's appear animations move things
   * (`.appear-elegant` in `src/styles.css`). Transforms are composited, so the browser does not
   * count them as layout shifts, and neither should this: a rect-based diff reports every appear
   * animation as a ~100px shift that the real `layout-shift` observer never sees.
   *
   * Accumulating `offsetLeft`/`offsetTop` up the `offsetParent` chain gives the layout position
   * instead, and it is document-relative, so scrolling does not register as a shift either. The
   * cost is that `offset*` is integer-rounded; sub-pixel movement below half a pixel is invisible
   * here, which is the movement that scores ~0 anyway.
   */
  function boxOf(el) {
    let x = 0;
    let y = 0;
    for (let n = el; n; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  /** Document coordinates, so compare against the scroll position rather than the viewport. */
  const onScreen = (b) =>
    b.w > 0 &&
    b.h > 0 &&
    b.y + b.h > scrollY &&
    b.y < scrollY + innerHeight &&
    b.x + b.w > scrollX &&
    b.x < scrollX + innerWidth;

  /** Every element on screen, keyed by node, valued by its layout box. */
  function snapshot() {
    const boxes = new Map();
    for (const el of document.querySelectorAll("*")) {
      if (SKIP.has(el.tagName)) continue;
      const b = boxOf(el);
      if (options.onScreenOnly && !onScreen(b)) continue;
      boxes.set(el, b);
    }
    return boxes;
  }

  const area = (a, b) => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const r = Math.max(a.x + a.w, b.x + b.w);
    const bo = Math.max(a.y + a.h, b.y + b.h);
    return Math.max(0, r - x) * Math.max(0, bo - y);
  };

  /** The browser's own shape: impact area x distance moved, over the viewport. */
  function scoreOf(prev, cur) {
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = document.documentElement.clientHeight || innerHeight;
    const impact = area(prev, cur) / (vw * vh);
    const distance = Math.max(Math.abs(cur.x - prev.x), Math.abs(cur.y - prev.y));
    return impact * (distance / Math.max(vw, vh));
  }

  const box = (b) => `${round(b.x)},${round(b.y)} ${round(b.w)}x${round(b.h)}`;

  function row(el, at, kind, prev, cur) {
    return {
      at,
      kind,
      id: idOf(el),
      element: short(el),
      tag: el.tagName.toLowerCase(),
      dx: round(cur.x - prev.x),
      dy: round(cur.y - prev.y),
      dw: round(cur.w - prev.w),
      dh: round(cur.h - prev.h),
      from: box(prev),
      to: box(cur),
      score: Number(scoreOf(prev, cur).toFixed(5)),
      node: el,
    };
  }

  /**
   * Diff two snapshots.
   *
   * Nodes are matched by identity first; a node that was replaced (a framework re-rendering its
   * subtree is a remove + an insert) is matched again by its `short()` signature, so a re-render
   * that lands an element somewhere else is reported as the move it is, not as a disappearance.
   */
  function diff(prev, next, at) {
    const rows = [];
    const gone = [];
    const fresh = [];
    const dropped = []; // the nodes that left the document this frame, by identity

    for (const [el, cur] of next) {
      const old = prev.get(el);
      if (!old) {
        fresh.push([el, cur]);
        continue;
      }
      if (
        Math.abs(cur.x - old.x) < EPS &&
        Math.abs(cur.y - old.y) < EPS &&
        Math.abs(cur.w - old.w) < EPS &&
        Math.abs(cur.h - old.h) < EPS
      )
        continue;
      rows.push(row(el, at, "shifted", old, cur));
    }
    for (const [el, old] of prev) if (!next.has(el)) gone.push([el, old]);

    const bySig = new Map();
    for (const [el, cur] of fresh) {
      const sig = short(el);
      let list = bySig.get(sig);
      if (!list) bySig.set(sig, (list = []));
      list.push([el, cur]);
    }

    const appeared = [];
    for (const [el, old] of gone) {
      dropped.push(el);
      const list = bySig.get(short(el));
      const hit = list && list.shift();
      if (hit) rows.push(row(hit[0], at, "replaced", old, hit[1]));
      else appeared.push(row(el, at, "removed", old, old));
    }
    for (const list of bySig.values())
      for (const [el, cur] of list) appeared.push(row(el, at, "added", cur, cur));

    return { rows, appeared, dropped };
  }

  /**
   * Keep only the outermost moved element per subtree: a child's move is a consequence.
   *
   * Only an ancestor that actually moved or changed width masks its descendants. `html` growing
   * taller as content lands is a *result* of the shift, not its cause, and would otherwise hide
   * every element that moved inside it.
   */
  function roots(rows) {
    const masks = new Set(rows.filter((r) => r.dx !== 0 || r.dy !== 0 || r.dw !== 0).map((r) => r.node));
    return rows.filter((r) => {
      for (let p = r.node.parentElement; p; p = p.parentElement) if (masks.has(p)) return false;
      return true;
    });
  }

  /* -------------------------------------------------------- view transitions -- */

  /**
   * A view transition is not a layout shift, but it fails for the same reason one appears: a
   * component arriving late and changing the page under the visitor.
   *
   * A cross-document transition captures the elements that ask for it by `view-transition-name`,
   * and **aborts the whole transition when one of those elements leaves the document while it is
   * running**. A prerendered page is exactly the trap: it hands its markup to the visitor before
   * any component has upgraded, so the moment a team's framework mounts *over* that markup rather
   * than hydrating it, every captured node is replaced and the morph the page asked for is thrown
   * away a few frames in, silently. Nothing warns about it: the outgoing document only sees
   * `InvalidStateError: Transition was aborted because of invalid state. Document hidden`.
   *
   * `pageswap` and `pagereveal` bracket the navigation, and the second is where the incoming
   * document learns it is being transitioned. This tracker is already the only thing here that
   * knows a node by identity and notices it being replaced, so the diagnosis is the `dropped` list
   * away: remember the names the transition captured, then report the ones the DOM takes away
   * while it is still running.
   */
  const transitions = [];

  /** The transition whose animations are running, or null. */
  let live = null;

  /** Every element this document is asking to be captured, and the name it asks for it under. */
  function collectCaptured() {
    const found = new Map();
    for (const el of document.querySelectorAll("*")) {
      const name = getComputedStyle(el).viewTransitionName;
      if (name && name !== "none") found.set(el, name);
    }
    return found;
  }

  const nameList = (found) => [...found].map(([el, name]) => `${name} <- ${short(el)}`);

  /**
   * The names a transition captured that are no longer in the document.
   *
   * Asked of the nodes themselves rather than of a snapshot diff, because the change that aborts a
   * transition is the same one that makes `finished` resolve: a diff would have to be taken on the
   * next frame, by which time the transition is already over and this tracker has stopped looking.
   */
  const casualties = (entry) =>
    [...(entry.captured || new Map())].filter(([el]) => !el.isConnected).map(([, name]) => name);

  /**
   * Records what a transition did, without ever rejecting.
   *
   * `ready` rejects on the outgoing side of *every* cross-document transition - the document is
   * hidden at commit, which is not a failure - and both reject when a transition is skipped. A
   * rejection is information here, never an error.
   */
  function watch(vt, entry) {
    if (entry.watched) return;
    entry.watched = true;

    vt.ready
      .then(() => (entry.ready = "resolved"))
      .catch((error) => (entry.ready = `${error.name}: ${error.message}`));
    vt.finished
      .then(() => (entry.finished = "resolved"))
      .catch((error) => (entry.finished = `${error.name}: ${error.message}`))
      .then(() => {
        if (!entry.canceled) {
          const gone = casualties(entry);
          if (gone.length) reportCanceled(entry, gone);
        }

        if (live === entry) live = null;
      });
  }

  function onPageSwap(event) {
    const vt = event.viewTransition;
    const activation = event.activation;
    const entry = {
      vt,
      direction: "out",
      at: Math.round(performance.now()),
      transitioned: !!vt,
      url: (activation && activation.entry && activation.entry.url) || location.href,
      names: nameList(collectCaptured()),
    };

    transitions.push(entry);
    if (vt) watch(vt, entry);
  }

  /**
   * The incoming half of the navigation.
   *
   * A tracker that started late has already adopted this transition from the document (see
   * `start`), and `pagereveal` still arrives after that: `activeViewTransition` is set before the
   * event is dispatched. So the transition object is the key, and the second arrival fills in the
   * entry the first one made rather than recording the same transition twice.
   */
  function onPageReveal(event) {
    const vt = event.viewTransition;
    let entry = vt && transitions.find((known) => known.vt === vt);

    if (!entry) {
      entry = {
        vt,
        direction: "in",
        at: Math.round(performance.now()),
        transitioned: !!vt,
        url: location.href,
        names: [],
      };

      transitions.push(entry);
    }

    entry.captured = collectCaptured();
    entry.names = nameList(entry.captured);

    if (!vt) return;

    live = entry;
    watch(vt, entry);
  }

  /**
   * The captured names this frame took away, for a transition that is still running. The same
   * question is asked of `isConnected` when the transition ends - see `casualties`.
   */
  const canceledBy = (entry, dropped) =>
    dropped
      .filter((el) => entry.captured && entry.captured.has(el))
      .map((el) => entry.captured.get(el));

  function reportCanceled(entry, gone) {
    entry.canceled = { at: Math.round(performance.now()), names: gone };

    console.group(
      `%c[cls]%c view transition CANCELED at ${entry.canceled.at}ms - ${gone.length} captured element(s) replaced`,
      "background:#ff5a55;color:#fff;border-radius:3px;padding:0 4px",
      "",
    );
    console.log(`captured as: ${gone.join(", ")}`);
    console.log(
      "A `view-transition-name` element leaving the document aborts the whole transition, so a",
      "prerendered page whose components mount over the markup instead of hydrating it loses the",
      "morph it asked for - and nothing else reports it.",
    );
    console.groupEnd();
  }

  const shifts = [];
  let prev = null;
  let queued = false;
  let watching = false;
  let first = true;
  const cleanups = [];

  /** The `on-dom-changed` handler: one snapshot per frame, however many mutations arrive. */
  function onDomChanged() {
    if (queued || !watching) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!watching) return;
      const next = snapshot();
      const at = Math.round(performance.now());
      if (prev) {
        const { rows, appeared, dropped } = diff(prev, next, at);

        if (options.trackTransitions && live && !live.canceled) {
          const gone = canceledBy(live, dropped);
          if (gone.length) reportCanceled(live, gone);
        }

        if (rows.length) emit(rows);
        else if (options.reportMutations && !first && appeared.length)
          console.debug(`[cls] ${at}ms - ${appeared.length} node(s) added/removed, nothing shifted`);
      }
      first = false;
      prev = next;
    });
  }

  function emit(rows) {
    shifts.push(...rows);
    const total = rows.reduce((a, r) => a + r.score, 0);
    console.groupCollapsed(
      `%c[cls]%c ${rows.length} element(s) shifted at ${rows[0].at}ms - score ${total.toFixed(4)}`,
      "background:#ff5a55;color:#fff;border-radius:3px;padding:0 4px",
      "",
    );
    console.table(rows.map(({ node, ...rest }) => rest));
    for (const r of roots(rows))
      console.log(`${r.score.toFixed(4)}  ${r.element}  ${r.from} -> ${r.to}`, r.node);
    console.groupEnd();
  }

  function report() {
    if (shifts.length) console.table(shifts.map(({ node, ...rest }) => rest));
    console.log(
      `[cls] ${shifts.length} change(s), total score ${shifts.reduce((a, r) => a + r.score, 0).toFixed(4)}`,
    );
    return shifts;
  }

  const api = {
    options,
    shifts,
    transitions,
    get running() {
      return watching;
    },
    start() {
      if (watching) return api;
      watching = true;
      prev = snapshot();

      const mo = new MutationObserver(onDomChanged);
      mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
      cleanups.push(() => mo.disconnect());

      const onChange = () => onDomChanged();
      const events = ["resize", "orientationchange", "transitionend", "animationend"];
      for (const ev of events) addEventListener(ev, onChange, true);
      cleanups.push(() => events.forEach((ev) => removeEventListener(ev, onChange, true)));

      if (options.trackTransitions) {
        const vtEvents = { pageswap: onPageSwap, pagereveal: onPageReveal };
        for (const type of Object.keys(vtEvents)) addEventListener(type, vtEvents[type]);
        cleanups.push(() => {
          for (const type of Object.keys(vtEvents)) removeEventListener(type, vtEvents[type]);
        });

        // Loaded before the first render, `pagereveal` is still ahead of us. A script that was
        // added late has missed it, and the transition is then only reachable from the document.
        const active = document.activeViewTransition;
        if (active && !live && !transitions.length) {
          const entry = {
            vt: active,
            direction: "in",
            at: Math.round(performance.now()),
            transitioned: true,
            url: location.href,
            names: [],
          };

          entry.captured = collectCaptured();
          entry.names = nameList(entry.captured);

          transitions.push(entry);
          live = entry;
          watch(active, entry);
        }
      }

      console.log("%c[cls] tracking layout shifts", "color:#ff5a55;font-weight:600");
      return api;
    },
    stop() {
      watching = false;
      cleanups.splice(0).forEach((fn) => fn());
      return api;
    },
    reset() {
      shifts.length = 0;
      transitions.length = 0;
      return api;
    },
    report,
    /** The view transitions this document took part in, and how each one ended. */
    vtReport() {
      if (transitions.length) {
        console.table(
          transitions.map((entry) => ({
            direction: entry.direction,
            at: entry.at,
            transitioned: entry.transitioned,
            url: entry.url,
            names: entry.names.join(", "),
            ready: entry.ready || "-",
            finished: entry.finished || "-",
            canceled: entry.canceled
              ? `${entry.canceled.names.length} captured name(s) at ${entry.canceled.at}ms`
              : "-",
          })),
        );
      }

      const lost = transitions.filter((entry) => entry.canceled).length;
      console.log(`[cls] ${transitions.length} view transition(s), ${lost} canceled`);

      return transitions;
    },
  };

  window.__cls = api;
  return api.start();
})();

