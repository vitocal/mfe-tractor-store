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
 *      CLS-shaped score, and calls out the outermost element that moved - the one worth fixing.
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
 *   __cls.stop()     // stop watching
 *   __cls.start()    // start again
 *   __cls.reset()    // forget what was collected
 */
(() => {
  if (window.__cls) return window.__cls.start();

  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD", "NOSCRIPT", "TEMPLATE"]);
  const EPS = 0.5; // sub-pixel moves are not shifts

  const options = { onScreenOnly: true, reportMutations: true };

  /** A stable, readable id per node, so a shift can be pointed at in the elements panel. */
  let seq = 0;
  const ids = new WeakMap();
  function idOf(el) {
    let id = ids.get(el);
    if (!id) ids.set(el, (id = `${el.tagName.toLowerCase()}${++seq}`));
    return id;
  }

  /** `main#main.d_ProductPage > div.page` - enough to find the element by hand. */
  function short(el) {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      const cls =
        typeof n.className === "string" && n.className.trim()
          ? "." + n.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : "") + cls);
      if (n.id) break;
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
      const list = bySig.get(short(el));
      const hit = list && list.shift();
      if (hit) rows.push(row(hit[0], at, "replaced", old, hit[1]));
      else appeared.push(row(el, at, "removed", old, old));
    }
    for (const list of bySig.values())
      for (const [el, cur] of list) appeared.push(row(el, at, "added", cur, cur));

    return { rows, appeared };
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
        const { rows, appeared } = diff(prev, next, at);
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
      return api;
    },
    report,
  };

  window.__cls = api;
  return api.start();
})();

