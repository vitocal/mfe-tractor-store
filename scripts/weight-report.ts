/**
 * What the prerendered site weighs, and what a page pulls to become itself.
 *
 * Every number here is read from the built output rather than estimated. The shell's own build
 * manifest (`dist/.vite/manifest.json`) says which file each module compiled into and what that
 * file imports, and the pages are the files the SSG pass wrote. A page's weight is therefore the
 * transfer the browser actually pays: its html, the stylesheets it links, the entry, and the
 * chunks its components pull - each one gzipped, because that is what crosses the wire.
 *
 * The dependency tree is the graph the browser walks: the document, the entry it carries, the
 * chunks the page's custom elements load, and the shared chunks those import in turn. It is read
 * from the *shell* manifest, because that is the build whose files the browser requests - a team's
 * components are compiled into the shell's `chunks/`, which is why a page pulls `/chunks/home.ce.js`
 * and not `/explore/dist/chunks/home.ce.js`.
 *
 * It writes `reports/weight.html`: one self-contained file - no scripts, no fonts, no network -
 * with the charts drawn as inline svg, so it can be opened from disk or attached to a review.
 *
 * Run it after a build, with `npm run report`.
 */

import FS from "node:fs/promises";
import Path from "node:path";
import Zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { designSystemBuild, tagsIn, teamBuild } from "./component-styles.ts";
import { TEAMS } from "./ssg-teams.ts";

/* ------------------------------------------------------------------- paths -- */

const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the shell build wrote, and where its pages are read from */
const OUTPUT_DIR = Path.join(ROOT_DIR, "dist");

/** Where the report is written */
const REPORT_FILE = Path.join(ROOT_DIR, "reports", "weight.html");

/** The roots a url is resolved against, the same three the SSG renders assets from */
const ROOTS = [ROOT_DIR, Path.join(ROOT_DIR, "public"), OUTPUT_DIR];

/* ------------------------------------------------------------------- types -- */

/** What a file is, which is also how the charts colour it */
type Kind = "html" | "js" | "css";

/** A file a page pulls: where it lives, and what it costs on the wire */
interface Asset {
  /** The url the browser asks for, eg `/chunks/home.ce.js` */
  url: string;
  /** The file it is served from, relative to the repo root */
  file: string;
  kind: Kind;
  /** Bytes on disk */
  raw: number;
  /** Bytes gzipped, which is what a server sends */
  gzip: number;
}

/** A Vite build manifest entry, as far as a weight report reads it */
interface Entry {
  file: string;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  isDynamicEntry?: boolean;
}

/** A Vite build manifest: every module a build emitted, keyed by module path */
type Manifest = Record<string, Entry>;

/** A component a page can use: the tag that names it, and the chunk it loads */
interface Component {
  /** The shell manifest key of the chunk, eg `explore/dist/chunks/home.ce.js` */
  key: string;
  /** The chunk as the browser asks for it */
  url: string;
  /** The stylesheets the component needs, as the SSG links them */
  css: string[];
}

/** One node of a page's dependency tree */
interface Node {
  url: string;
  kind: Kind;
  raw: number;
  gzip: number;
  children: Node[];
  /** Set on a chunk more than one branch of the tree pulls, so the chart counts it once */
  shared?: boolean;
}

/** A page, and everything it pulls */
interface Page {
  /** The route the page was prerendered for */
  url: string;
  file: string;
  html: Asset;
  /** The chunks the page's components pull, the entry included */
  js: Node[];
  /** The stylesheets the page links */
  css: Node[];
  tags: string[];
  tree: Node;
  totals: { html: number; js: number; css: number; gzip: number; raw: number };
}


/* ------------------------------------------------------------------ assets -- */

const weights = new Map<string, Asset | null>();

/** `assets/home-abc.css` -> `/assets/home-abc.css`, so a url resolves from any page depth */
function toUrl(file: string): string {
  return `/${file.replace(/^\/+/, "")}`;
}

/**
 * Weighs `url`: the first root that has it wins, the way the render's own asset reader works.
 *
 * Gzip is the number that matters for a transfer, and it is measured rather than assumed: a chunk
 * with a lot of repetition compresses to a fraction of its file size, and a chart drawn from raw
 * bytes would point at the wrong file.
 */
async function weigh(url: string, kind: Kind): Promise<Asset | null> {
  const cached = weights.get(url);

  if (cached !== undefined) return cached;

  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  let asset: Asset | null = null;

  for (const root of ROOTS) {
    const file = Path.join(root, pathname);

    try {
      const body = await FS.readFile(file);

      asset = {
        url,
        file: Path.relative(ROOT_DIR, file),
        kind,
        raw: body.length,
        gzip: Zlib.gzipSync(body).length,
      };
      break;
    } catch {
      // try the next root
    }
  }

  weights.set(url, asset);

  return asset;
}

/**
 * Weighs a file by path.
 *
 * A page is read from the output directory directly rather than resolved by url: the repo root
 * holds an `index.html` of its own - the shell's source template - and a url lookup would weigh
 * that one instead of the page the build wrote.
 */
async function weighFile(file: string, kind: Kind): Promise<Asset> {
  const body = await FS.readFile(file);

  return {
    url: toUrl(Path.relative(OUTPUT_DIR, file).replace(/\\/g, "/")),
    file: Path.relative(ROOT_DIR, file),
    kind,
    raw: body.length,
    gzip: Zlib.gzipSync(body).length,
  };
}

/* --------------------------------------------------------------- manifests -- */

/** Reads a build manifest, or explains which build is missing */
async function readManifest(file: string, build: string): Promise<Manifest> {
  try {
    return JSON.parse(await FS.readFile(file, "utf8")) as Manifest;
  } catch {
    throw new Error(
      `The ${build} build manifest is missing (${Path.relative(ROOT_DIR, file)}). ` +
        `Run "npm run build" or "npm run build:ssg" first.`,
    );
  }
}

/** The shell manifest, whose `file`s are the urls the browser actually requests */
function shellManifest(): Promise<Manifest> {
  return readManifest(Path.join(OUTPUT_DIR, ".vite", "manifest.json"), "shell");
}

/**
 * Every custom element a page can use, and the chunk it loads.
 *
 * A team names its components its own way, so each team's manifest is read through its own
 * `tagFor` - the same mapping the SSG links stylesheets with. The chunk a tag loads is the
 * *shell's* copy of it (`/chunks/home.ce.js`) rather than the team's own `dist`, because the shell
 * build is what the browser is served.
 */
async function componentIndex(shell: Manifest): Promise<Map<string, Component>> {
  const index = new Map<string, Component>();

  /** The url the shell serves a chunk under, or the team's own when the shell does not emit it */
  function urlOf(key: string, fallback: string): string {
    return shell[key] ? toUrl(shell[key].file) : fallback;
  }

  for (const team of TEAMS) {
    const manifest = await readManifest(
      Path.join(ROOT_DIR, team.name, "dist", ".vite", "manifest.json"),
      team.name,
    );
    const build = teamBuild(team.name, team.extension, manifest);

    for (const [module, output] of Object.entries(manifest)) {
      const tag = build.tagFor(module);

      if (!tag) continue;

      const key = `${team.name}/dist/${output.file}`;

      index.set(tag, {
        key,
        url: urlOf(key, toUrl(`${team.name}/dist/${output.file}`)),
        css: (output.css ?? []).map(toUrl),
      });
    }
  }

  const design = designSystemBuild(shell);

  for (const [module, output] of Object.entries(shell)) {
    const tag = design.tagFor(module);

    if (!tag) continue;

    index.set(tag, { key: module, url: toUrl(output.file), css: (output.css ?? []).map(toUrl) });
  }

  return index;
}

/** Every html file a build wrote, as the route each one answers */
async function pagesOnDisk(): Promise<{ url: string; file: string }[]> {
  const files = (await FS.readdir(OUTPUT_DIR, { recursive: true }))
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.replace(/\\/g, "/"));

  return files
    .map((file) => ({
      url: `/${file.replace(/(index)?\.html$/, "")}`,
      file: Path.join(OUTPUT_DIR, file),
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

/* ------------------------------------------------------------------- model -- */

/**
 * The node for a url, marking it `shared` when the tree has already pulled it.
 *
 * A chunk reached twice is one request, not two: the browser has it by then. Marking rather than
 * duplicating is what keeps a page's total honest - and it is also how the cycle a chunk closes
 * back to the entry (`chunks/button.js` imports `index.js`) is cut.
 */
async function nodeFor(url: string, kind: Kind, seen: Set<string>): Promise<Node | null> {
  const asset = await weigh(url, kind);

  if (!asset) return null;

  if (seen.has(url)) return { url, kind, raw: asset.raw, gzip: asset.gzip, children: [], shared: true };

  seen.add(url);

  return { url, kind, raw: asset.raw, gzip: asset.gzip, children: [] };
}

/** Puts the chunks `keys` name under `node`, and everything they import under those */
async function descend(
  node: Node,
  keys: string[],
  shell: Manifest,
  seen: Set<string>,
): Promise<void> {
  for (const key of keys) {
    const entry = shell[key];

    if (!entry) continue;

    const child = await nodeFor(toUrl(entry.file), "js", seen);

    if (!child) continue;

    node.children.push(child);

    // A chunk already in the tree is not walked again: its children are there too.
    if (child.shared) continue;

    await descend(child, entry.imports ?? [], shell, seen);
  }
}

/** Adds the stylesheets a component links, as leaves: a page fetches them, but they pull nothing */
async function addStyles(node: Node, urls: string[], seen: Set<string>): Promise<void> {
  for (const url of urls) {
    const child = await nodeFor(url, "css", seen);

    if (child) node.children.push(child);
  }
}

/**
 * A page's dependency tree: its html, the entry it carries, and one branch per component.
 *
 * The branch of a component is the chunk its tag loads - from the *shell's* copy, which is the
 * file the browser asks for - plus that chunk's stylesheet and everything it imports.
 */
async function pageTree(
  html: Asset,
  tags: string[],
  shell: Manifest,
  components: Map<string, Component>,
): Promise<Node> {
  const seen = new Set<string>();
  const root: Node = { url: html.url, kind: "html", raw: html.raw, gzip: html.gzip, children: [] };
  const entry = shell["index.html"];

  if (!entry) return root;

  const entryNode = await nodeFor(toUrl(entry.file), "js", seen);

  if (!entryNode) return root;

  root.children.push(entryNode);
  await addStyles(entryNode, (entry.css ?? []).map(toUrl), seen);

  for (const tag of tags) {
    const component = components.get(tag);

    if (!component) continue;

    const chunk = await nodeFor(component.url, "js", seen);

    if (!chunk) continue;

    entryNode.children.push(chunk);

    if (chunk.shared) continue;

    await descend(chunk, shell[component.key]?.imports ?? [], shell, seen);
    await addStyles(chunk, component.css, seen);
  }

  return root;
}

/** Every url in a tree, once: what the page actually requests */
function flatten(node: Node, urls = new Map<string, Node>()): Map<string, Node> {
  if (!urls.has(node.url)) urls.set(node.url, node);

  for (const child of node.children) flatten(child, urls);

  return urls;
}

/** Reads a page: its html, its tags, and the tree it pulls */
async function readPage(
  page: { url: string; file: string },
  shell: Manifest,
  components: Map<string, Component>,
): Promise<Page> {
  const body = await FS.readFile(page.file, "utf8");
  const html = await weighFile(page.file, "html");

  if (!html) throw new Error(`Could not weigh ${Path.relative(ROOT_DIR, page.file)}`);

  const tags = tagsIn(body);
  const tree = await pageTree(html, tags, shell, components);
  const requested = flatten(tree);
  const js = [...requested.values()].filter((node) => node.kind === "js");
  const css = [...requested.values()].filter((node) => node.kind === "css");
  const sum = (nodes: Node[]) => nodes.reduce((total, node) => total + node.gzip, 0);
  const raw = (nodes: Node[]) => nodes.reduce((total, node) => total + node.raw, 0);

  return {
    url: page.url,
    file: Path.relative(ROOT_DIR, page.file),
    html,
    js,
    css,
    tags,
    tree,
    totals: {
      html: html.gzip,
      js: sum(js),
      css: sum(css),
      gzip: html.gzip + sum(js) + sum(css),
      raw: html.raw + raw(js) + raw(css),
    },
  };
}

/** How many pages pull each chunk, which is what separates the shared runtime from a page's own */
function chunkReach(pages: Page[]): Map<string, number> {
  const reach = new Map<string, number>();

  for (const page of pages) {
    for (const asset of page.js) reach.set(asset.url, (reach.get(asset.url) ?? 0) + 1);
  }

  return reach;
}

/* ---------------------------------------------------------------- drawing -- */

/** One colour per kind, so a chart and its legend agree: javascript is the store's own accent */
const COLORS: Record<Kind, string> = { html: "#12b886", css: "#7c5cff", js: "#ff5a55" };

/** Bytes as a reader reads them: `12.4 kB`, or the bytes themselves when they are small */
function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

/** Escapes text for html, so a url can not break the page it is reported on */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A segment of a stacked bar: what it is, what it weighs, and the colour it gets */
interface Segment {
  label: string;
  value: number;
  color: string;
}

/** One bar: the row it names, and the segments that make it up */
interface Bar {
  label: string;
  hint?: string;
  segments: Segment[];
}

/** What a bar adds up to */
function total(bar: Bar): number {
  return bar.segments.reduce((sum, segment) => sum + segment.value, 0);
}

/**
 * A stacked horizontal bar chart, as inline svg.
 *
 * Bars share one scale, so two pages can be compared by eye - which is the whole point of drawing
 * the weight of every page rather than printing a table nobody reads twice. The total is printed
 * at the end of each bar, and every segment carries a `<title>` with its own number.
 */
function barChart(bars: Bar[]): string {
  const width = 1040;
  const labelWidth = 300;
  const valueWidth = 96;
  const plotWidth = width - labelWidth - valueWidth - 24;
  const rowHeight = 30;
  const height = bars.length * rowHeight + 34;
  const max = Math.max(1, ...bars.map((bar) => total(bar)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const x = labelWidth + fraction * plotWidth;

    return (
      `<line class="grid" x1="${x}" y1="0" x2="${x}" y2="${bars.length * rowHeight}" />` +
      `<text class="tick" x="${x}" y="${bars.length * rowHeight + 22}" text-anchor="middle">${kb(max * fraction)}</text>`
    );
  });

  const rows = bars.map((bar, index) => {
    const y = index * rowHeight;
    let x = labelWidth;
    const parts = bar.segments
      .filter((segment) => segment.value > 0)
      .map((segment) => {
        const w = Math.max(1, (segment.value / max) * plotWidth);
        const rect =
          `<rect x="${x.toFixed(1)}" y="${y + 5}" width="${w.toFixed(1)}" height="14" fill="${segment.color}">` +
          `<title>${escape(segment.label)}: ${kb(segment.value)} gzipped</title></rect>`;

        x += w;

        return rect;
      })
      .join("");

    const hint = bar.hint
      ? `<text class="hint" x="${labelWidth - 10}" y="${y + 16}" text-anchor="end">${escape(bar.hint)}</text>`
      : "";

    return (
      `<g><text class="label" x="14" y="${y + 16}">${escape(bar.label)}</text>${hint}${parts}` +
      `<text class="value" x="${width - 8}" y="${y + 16}" text-anchor="end">${kb(total(bar))}</text></g>`
    );
  });

  return (
    `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">` +
    `${ticks.join("")}${rows.join("")}</svg>`
  );
}

/** A legend for the colours a chart uses, with the total each colour accounts for */
function legend(segments: Segment[]): string {
  return (
    `<ul class="legend">` +
    segments
      .map(
        (segment) =>
          `<li><i style="background:${segment.color}"></i>${escape(segment.label)}` +
          `<b>${kb(segment.value)}</b></li>`,
      )
      .join("") +
    `</ul>`
  );
}


/**
 * A donut, as inline svg: the share each kind has of one total.
 *
 * Drawn with `stroke-dasharray` on a circle per slice rather than an arc path - a slice is a
 * fraction of a circumference, and a dash is exactly that, so no trigonometry has to keep the
 * slices from drifting apart.
 */
function donut(slices: Segment[], size = 240): string {
  const radius = size / 2 - 18;
  const circumference = 2 * Math.PI * radius;
  const sum = slices.reduce((all, slice) => all + slice.value, 0) || 1;
  let offset = 0;

  const rings = slices
    .map((slice) => {
      const dash = (slice.value / sum) * circumference;
      const ring =
        `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${slice.color}" ` +
        `stroke-width="26" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" ` +
        `stroke-dashoffset="${(-offset).toFixed(2)}">` +
        `<title>${escape(slice.label)}: ${kb(slice.value)} (${((slice.value / sum) * 100).toFixed(1)}%)</title>` +
        `</circle>`;

      offset += dash;

      return ring;
    })
    .join("");

  return (
    `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img">` +
    `<g transform="rotate(-90 ${size / 2} ${size / 2})">${rings}</g>` +
    `<text class="donut__value" x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle">${kb(sum)}</text>` +
    `<text class="donut__unit" x="${size / 2}" y="${size / 2 + 18}" text-anchor="middle">gzipped</text>` +
    `</svg>`
  );
}

/**
 * A page's dependency tree, as nested rows with a bar each.
 *
 * The bars are scaled to the heaviest file in the tree rather than to the page: the question a tree
 * answers is where the weight sits, and a chunk worth 4% of a page would be invisible next to its
 * entry.
 */
function tree(nodes: Node[], max: number, depth = 0): string {
  return nodes
    .map((node) => {
      const width = Math.max(0.6, (node.gzip / max) * 100);
      const shared = node.shared
        ? `<i class="shared" title="already pulled by another branch, so it is one request">shared</i>`
        : "";
      const row =
        `<div class="node" style="--depth:${depth}">` +
        `<span class="node__name"><i class="kind kind--${node.kind}">${node.kind}</i>` +
        `<code>${escape(node.url)}</code>${shared}</span>` +
        `<span class="node__bar"><i style="width:${width.toFixed(1)}%;background:${COLORS[node.kind]}"></i></span>` +
        `<span class="node__size">${kb(node.gzip)}</span>` +
        `</div>`;

      return row + tree(node.children, max, depth + 1);
    })
    .join("");
}

/** The heaviest gzip size in a tree, which is what its bars are scaled to */
function heaviest(nodes: Node[]): number {
  return nodes.reduce((max, node) => Math.max(max, node.gzip, heaviest(node.children)), 1);
}

/** A table of rows, each a list of cells */
function table(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${escape(header)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("");

  return `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A stat card: the number a reader came for, and what it counts */
function card(label: string, value: string, note: string): string {
  return (
    `<div class="card"><span class="card__label">${escape(label)}</span>` +
    `<span class="card__value">${escape(value)}</span>` +
    `<span class="card__note">${note}</span></div>`
  );
}

/** A section of the report */
function section(id: string, title: string, lead: string, body: string): string {
  return `<section id="${id}"><h2>${escape(title)}</h2><p class="lead">${lead}</p>${body}</section>`;
}


/* ----------------------------------------------------------------- report -- */

/**
 * The style the report carries inline: one file, and nothing to request when it is opened.
 *
 * Light on purpose - the charts are read next to the store's own pages, and a dark theme would
 * make the accent colour mean something different in each.
 */
const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 32px 80px; background: #f7f7f8; color: #16161a;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 30px; letter-spacing: -0.02em; }
  h2 { margin: 0 0 4px; font-size: 20px; letter-spacing: -0.01em; }
  h3 { margin: 28px 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
  p { margin: 0 0 16px; }
  code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .meta { color: #6b7280; margin-bottom: 28px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
  .card { display: grid; gap: 2px; padding: 14px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
  .card__label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
  .card__value { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; }
  .card__note { font-size: 13px; color: #6b7280; }
  section { margin-top: 44px; padding-top: 28px; border-top: 1px solid #e5e7eb; }
  .lead { color: #4b5563; max-width: 78ch; }
  .chart { display: block; width: 100%; height: auto; overflow: visible; }
  .chart .label { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #16161a; }
  .chart .hint, .chart .tick { font: 11px ui-sans-serif, system-ui, sans-serif; fill: #9ca3af; }
  .chart .value { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #4b5563; }
  .chart .grid { stroke: #e5e7eb; stroke-width: 1; }
  .split { display: flex; flex-wrap: wrap; gap: 32px; align-items: center; }
  .donut { width: 240px; height: 240px; flex: none; }
  .donut__value { font: 700 26px ui-sans-serif, system-ui, sans-serif; fill: #16161a; }
  .donut__unit { font: 12px ui-sans-serif, system-ui, sans-serif; fill: #9ca3af; }
  .legend { list-style: none; display: grid; gap: 8px; margin: 0; padding: 0; min-width: 260px; }
  .legend li { display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .legend i { width: 12px; height: 12px; border-radius: 3px; }
  .legend b { margin-left: auto; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; color: #4b5563; }
  .node {
    display: grid; grid-template-columns: minmax(0, 1fr) 260px 78px; gap: 12px; align-items: center;
    padding: 3px 0 3px calc(var(--depth) * 22px); border-bottom: 1px dotted #e5e7eb;
  }
  .node__name { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .node__name code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .node__bar { height: 10px; background: #eceef1; border-radius: 999px; overflow: hidden; }
  .node__bar i { display: block; height: 100%; border-radius: 999px; }
  .node__size { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #4b5563; text-align: right; }
  .kind { font: 600 10px ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 999px; color: #fff; flex: none; }
  .kind--js { background: #ff5a55; } .kind--css { background: #7c5cff; } .kind--html { background: #12b886; }
  .shared { font: 11px ui-sans-serif, system-ui, sans-serif; color: #9ca3af; border: 1px solid #e5e7eb; border-radius: 999px; padding: 0 6px; flex: none; }
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #d1d5db; padding: 6px 8px; }
  .table td { padding: 5px 8px; border-bottom: 1px solid #eef0f2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .table td:first-child { font-family: inherit; }
  .notes { color: #4b5563; max-width: 78ch; }
  .notes li { margin-bottom: 6px; }
`;


/** Every chunk the site loads, once, keyed by the url the browser asks for */
function chunkIndex(pages: Page[]): Map<string, Node> {
  const chunks = new Map<string, Node>();

  for (const page of pages) {
    for (const node of page.js) if (!chunks.has(node.url)) chunks.set(node.url, node);
  }

  return chunks;
}

/** The pages worth drawing a whole tree for: the root, the heaviest, and the widest */
function showcase(pages: Page[]): Page[] {
  const root = pages.find((page) => page.url === "/");
  const heaviest = [...pages].sort((a, b) => b.totals.gzip - a.totals.gzip)[0];
  const widest = [...pages].sort((a, b) => b.js.length - a.js.length)[0];
  const wanted = [root, heaviest, widest].filter((page): page is Page => page !== undefined);

  return [...new Map(wanted.map((page) => [page.url, page])).values()];
}

/** One row per page, heaviest first: the table behind the chart */
function pageTable(pages: Page[]): string {
  const rows = [...pages]
    .sort((a, b) => b.totals.gzip - a.totals.gzip)
    .map((page) => [
      `<code>${escape(page.url)}</code>`,
      kb(page.totals.html),
      kb(page.totals.css),
      kb(page.totals.js),
      `<b>${kb(page.totals.gzip)}</b>`,
      kb(page.totals.raw),
      `${page.js.length}`,
      `${page.tags.length}`,
    ]);

  return table(["page", "html", "css", "js", "total (gzip)", "total (raw)", "chunks", "tags"], rows);
}


/**
 * The report, as one html file.
 *
 * The order is the order the questions get asked: what does the shell cost on every page, what
 * does each page cost, what is in the chunks, and then where the weight of a page actually sits -
 * the dependency tree, which is the only view that says *why* a page weighs what it does.
 */
function report(pages: Page[], shell: Manifest, reach: Map<string, number>): string {
  const root = pages.find((page) => page.url === "/") ?? pages[0];
  const entry = root.js[0];
  const entryCss = root.css[0];
  const chunks = chunkIndex(pages);
  const lazy = shell["index.html"]?.dynamicImports?.length ?? 0;
  const heaviestPage = [...pages].sort((a, b) => b.totals.gzip - a.totals.gzip)[0];
  const boot: Segment[] = [
    { label: "index.html", value: root.totals.html, color: COLORS.html },
    { label: "index.js", value: entry?.gzip ?? 0, color: COLORS.js },
    { label: "index.css", value: entryCss?.gzip ?? 0, color: COLORS.css },
  ];
  const cards = [
    card("index.js", kb(entry?.gzip ?? 0), `${kb(entry?.raw ?? 0)} raw, on every page`),
    card("index.css", kb(entryCss?.gzip ?? 0), `${kb(entryCss?.raw ?? 0)} raw, on every page`),
    card("index.html", kb(root.totals.html), `${kb(root.html.raw)} raw, prerendered markup`),
    card(
      "first view",
      kb(boot.reduce((sum, segment) => sum + segment.value, 0)),
      "the shell, before a component loads",
    ),
    card("heaviest page", kb(heaviestPage.totals.gzip), escape(heaviestPage.url)),
    card("pages", `${pages.length}`, `${chunks.size} chunks, one html file each`),
    card("components", `${lazy}`, "chunks the shell can load lazily"),
  ];
  const pageBars: Bar[] = [...pages]
    .sort((a, b) => b.totals.gzip - a.totals.gzip)
    .map((page) => ({
      label: page.url,
      hint: `${page.js.length} chunks`,
      segments: [
        { label: `${page.url} html`, value: page.totals.html, color: COLORS.html },
        { label: `${page.url} css`, value: page.totals.css, color: COLORS.css },
        { label: `${page.url} js`, value: page.totals.js, color: COLORS.js },
      ],
    }));
  const chunkBars: Bar[] = [...chunks.values()]
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 16)
    .map((chunk) => ({
      label: chunk.url,
      hint: reach.get(chunk.url) === pages.length ? "every page" : `${reach.get(chunk.url)} pages`,
      segments: [{ label: chunk.url, value: chunk.gzip, color: COLORS.js }],
    }));
  const trees = showcase(pages)
    .map((page) => {
      const markup = `<div class="tree">${tree([page.tree], heaviest([page.tree]))}</div>`;

      return `<h3>${escape(page.url)} - ${kb(page.totals.gzip)} gzipped, ${page.js.length} chunks</h3>${markup}`;
    })
    .join("");

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>SSG weight report</title><style>${STYLE}</style></head><body><main>` +
    `<h1>What the prerendered site weighs</h1>` +
    `<p class="meta">${pages.length} pages from <code>${Path.relative(ROOT_DIR, OUTPUT_DIR)}/</code>, ` +
    `read from the shell's build manifest. Gzip is measured per file, not estimated.</p>` +
    `<div class="cards">${cards.join("")}</div>` +
    section(
      "shell",
      "The shell, on every page",
      "Every page carries the same entry and the same base stylesheet, so this is the floor a " +
        "visitor pays before a single component of the page has loaded.",
      `<div class="split">${donut(boot)}${legend(boot)}</div>`,
    ) +
    section(
      "pages",
      "Every page, by weight",
      "Prerendered markup, the stylesheets the page links, and the chunks its components pull: the " +
        "whole transfer for a first view, with no query string and no lazy image counted.",
      barChart(pageBars),
    ) +
    section(
      "chunks",
      "The chunks",
      "The heaviest chunks in the build, and how much of the site reads them. A chunk every page " +
        "pulls is the shared runtime; a chunk one page pulls is that page's own component.",
      barChart(chunkBars),
    ) +
    section(
      "tree",
      "The network dependency tree",
      "What the browser fetches, and in what order it becomes able to run: the document, the entry " +
        "it carries, and one branch per custom element on the page. A branch marked " +
        "<em>shared</em> was already pulled by an earlier one, so it is a single request.",
      trees,
    ) +
    section(
      "table",
      "Every page",
      "The same numbers as the chart, with the raw sizes next to them.",
      pageTable(pages),
    ) +
    section(
      "notes",
      "How to read this",
      "",
      `<ul class="notes">` +
        `<li>Every size is a file as it sits in <code>dist/</code>, gzipped at the default level: ` +
        `what a server sends, before http overhead. Nothing here is a lab measurement.</li>` +
        `<li>The chunks are the <em>shell's</em> copies (<code>/chunks/home.ce.js</code>), not a ` +
        `team's own <code>dist</code>. The shell build compiles the teams' components in, so that is ` +
        `what the browser asks for.</li>` +
        `<li>A page's javascript is its transitive closure: the entry, one chunk per component tag ` +
        `on the page, and everything those import. A chunk pulled twice is counted once.</li>` +
        `<li>Stylesheets are counted per page, not per component, so two components that share one ` +
        `are a single request - which is why the css column is smaller than the sum of the components.</li>` +
        `<li>Images, fonts, and the <code>canvas-confetti</code> the thanks page pulls from a cdn are ` +
        `not part of this: they are not in the build manifest.</li>` +
        `</ul>`,
    ) +
    `</main></body></html>`
  );
}

/* -------------------------------------------------------------------- main -- */

/** Reads the build, and returns the pages and the reach of every chunk */
async function readBuild(): Promise<{ pages: Page[]; shell: Manifest; reach: Map<string, number> }> {
  const shell = await shellManifest();
  const components = await componentIndex(shell);
  const pages: Page[] = [];

  for (const page of await pagesOnDisk()) pages.push(await readPage(page, shell, components));

  return { pages, shell, reach: chunkReach(pages) };
}

/** Writes the report, and says what it found on the command line */
async function main(): Promise<void> {
  const { pages, shell, reach } = await readBuild();
  const heaviest = [...pages].sort((a, b) => b.totals.gzip - a.totals.gzip)[0];
  const root = pages.find((page) => page.url === "/") ?? pages[0];

  await FS.mkdir(Path.dirname(REPORT_FILE), { recursive: true });
  await FS.writeFile(REPORT_FILE, report(pages, shell, reach));

  console.log(`[report] ${pages.length} pages, ${chunkIndex(pages).size} chunks`);
  console.log(
    `[report] index.js ${kb(root.js[0]?.gzip ?? 0)} + index.css ${kb(root.css[0]?.gzip ?? 0)} ` +
      `+ ${kb(root.totals.html)} html, on every page`,
  );
  console.log(`[report] heaviest page ${heaviest.url} at ${kb(heaviest.totals.gzip)}`);
  console.log(`[report] written to ${Path.relative(ROOT_DIR, REPORT_FILE)}`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`[report] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
