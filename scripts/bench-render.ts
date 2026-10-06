/**
 * What a render costs, and where the time goes.
 *
 * `ceRenderToString` is the entry point a server answers html with, and the one the page tests
 * render through, so its cost is the cost of both. This measures it on the workload the build
 * actually runs: the same pages the prerender pass writes, from the same built shell, route
 * tables and builds - the pages come from `pagesFor`, so a new route or product shows up here
 * too.
 *
 * Three passes, because one number would hide what matters:
 *
 * - **one shot**: `ceRenderToString` per page, the way a server or a test calls it. It builds a
 *   renderer per page, so this is the number to watch when a render is on a request path.
 * - **breakdown**: that same render taken apart - the renderer itself, a page with no components
 *   in it (which still loads every component the team's catalog declares), a real page, and the
 *   stylesheets linked onto it. The gaps between them say whether a render costs the page, the
 *   catalog, or the renderer.
 * - **concurrency**: pages rendered several at a time. One renderer per call shares nothing with
 *   the next, so this is what a server gains by overlapping them.
 * - **one renderer**: every page through a single renderer, the way the prerender pass does. This
 *   is the floor paid once instead of once per page, and so the number to beat.
 *
 * Run it with `npm run bench`, which builds first. It reads the built shell and the built teams
 * and writes nothing.
 */

import FS from "node:fs/promises";
import OS from "node:os";
import Path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ServerRenderer, ServerRendererLogLevelEnum } from "@happy-dom/server-renderer";

import {
  ceBrowserSettings,
  ceRenderToString,
  ceSetupScript,
  createAssetResponder,
  stylesFor,
} from "./ce-render.ts";
import type { Catalog, CeAssetState, CeRenderOptions } from "./ce-render.ts";
import { withStylesheets } from "./component-styles.ts";
import type { Manifest } from "./component-styles.ts";
import { pagesFor, readRoutes, readShell } from "./ssg.ts";
import type { Page } from "./ssg.ts";
import { TEAMS } from "./ssg-teams.ts";
import type { Team } from "./ssg-teams.ts";

/** The repo root, where the built shell and the built teams are read from */
const ROOT_DIR = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..");

/** The roots a render reads assets from - the same three the pass gives it */
const ROOTS = [ROOT_DIR, Path.join(ROOT_DIR, "public"), Path.join(ROOT_DIR, "dist")];

/** A document with nothing in it: what a render costs before a page has said anything */
const EMPTY_PAGE = "<html><head></head><body></body></html>";

/** What a render is given, beyond the html: the url it is for, and the build it renders from */
interface Job {
  page: Page;
  manifest: Manifest;
  catalog: Catalog;
  options: CeRenderOptions;
}

/** How a set of timings looks, in milliseconds */
interface Stats {
  n: number;
  min: number;
  median: number;
  mean: number;
  p95: number;
  max: number;
  total: number;
}

/** Where a render's time goes, each step including the ones above it */
interface Breakdown {
  /** Building a renderer and closing it, with nothing rendered */
  renderer: number;
  /**
   * Plus a window, the catalog's setup script and the serialization, for an empty document.
   *
   * This is the floor under every render: `ceRenderToString` pays it once per call, whatever page
   * it is given, so it is the part a caller with many pages has to amortize.
   */
  floor: number;
  /** Plus the shell and the page's own components */
  page: number;
  /** What linking that page's stylesheets costs, inside the page's own time */
  styles: number;
}

/** `sorted`'s value at `q`, clamped to the ends */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;

  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** A set of timings as the numbers worth reading */
function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, ms) => sum + ms, 0);

  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    median: quantile(sorted, 0.5),
    mean: sorted.length ? total / sorted.length : 0,
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
    total,
  };
}

/** Runs `work` and answers how long it took, in milliseconds */
async function timed(work: () => Promise<unknown>): Promise<number> {
  const started = performance.now();

  await work();

  return performance.now() - started;
}

/**
 * The two artifacts a team's build publishes, and the url its catalog is served under.
 *
 * These are exactly what a render is handed, and reading them once per team is what a caller with
 * many pages of one team would do too.
 */
async function teamBuild(team: Team): Promise<Omit<Job, "page" | "options"> & { catalogUrl: string }> {
  const dir = Path.join(ROOT_DIR, team.name, "dist");
  const catalogUrl = `/${team.name}/dist/catalog.js`;
  const manifest = JSON.parse(
    await FS.readFile(Path.join(dir, ".vite", "manifest.json"), "utf8"),
  ) as Manifest;
  const catalog = ((await import(pathToFileURL(Path.join(dir, "catalog.js")).href)) as {
    default: Catalog;
  }).default;

  return { manifest, catalog, catalogUrl };
}

/**
 * Every page the prerender pass writes, with the build each one renders against.
 *
 * The shell is the built one, so the workload is the real page: the whole document, with the
 * route's markup in its stage.
 */
async function workload(teams: readonly Team[]): Promise<Job[]> {
  const template = await readShell();
  const jobs: Job[] = [];

  for (const team of teams) {
    const { manifest, catalog, catalogUrl } = await teamBuild(team);
    const routes = await readRoutes(team);

    for (const page of pagesFor(template, team.name, routes, await team.params())) {
      jobs.push({ page, manifest, catalog, options: { url: page.url, catalogUrl, roots: ROOTS } });
    }
  }

  return jobs;
}

/* ------------------------------------------------------------------- passes -- */

/** Renders a page through `ceRenderToString`, and answers the html it produced */
function renderPage(job: Job): Promise<string> {
  return ceRenderToString(job.page.html, job.manifest, job.catalog, job.options);
}

/**
 * Builds a renderer the way `ceRenderToString` does, and closes it without rendering.
 *
 * This is the floor under every call: a renderer is built and thrown away per page, so whatever
 * this costs is paid whether the page has one component or twenty.
 */
async function buildAndClose(job: Job): Promise<void> {
  const { catalogUrl = "" } = job.options;
  const state: CeAssetState = {
    code: [catalogUrl.slice(0, catalogUrl.lastIndexOf("/") + 1)],
    roots: ROOTS,
    missing: new Set<string>(),
  };
  const renderer = new ServerRenderer({
    logLevel: ServerRendererLogLevelEnum.error,
    worker: { disable: true },
    render: { setupScript: ceSetupScript([catalogUrl]) },
    browser: ceBrowserSettings(createAssetResponder(state)),
  });

  await renderer.close();
}

/**
 * Renders every page in turn, and keeps every timing and every pass's wall time.
 *
 * This is the shape a server has when a request arrives: one page, one renderer, no knowledge of
 * what the last page cost.
 */
async function oneShot(jobs: Job[], iterations: number): Promise<{ samples: number[][]; walls: number[] }> {
  const samples: number[][] = jobs.map(() => []);
  const walls: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now();

    for (const [index, job] of jobs.entries()) {
      samples[index].push(await timed(() => renderPage(job)));
    }

    walls.push(performance.now() - started);
  }

  return { samples, walls };
}

/** Runs `work` over `jobs`, keeping `limit` of them in flight at a time */
async function pooled(jobs: Job[], limit: number, work: (job: Job) => Promise<unknown>): Promise<void> {
  let next = 0;
  const runner = async () => {
    while (next < jobs.length) {
      const job = jobs[next];

      next += 1;
      await work(job);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, runner));
}

/** What rendering every page through one renderer cost */
interface BatchedPass {
  wall: number;
  perPage: number;
  /** Errors the pages reported, eg a third party import a render can not load */
  errors: string[];
}

/**
 * Renders every page through *one* renderer, the way the prerender pass does.
 *
 * This is the floor paid once instead of once per page: the window, the catalog setup and the
 * module registry are shared across every page, so what is left is the page itself. It loads every
 * team's catalog, as a shared renderer has to, and renders one page at a time so that the sharing
 * is what is being measured.
 */
async function batchedPass(jobs: Job[], teams: readonly Team[]): Promise<BatchedPass> {
  const catalogs = teams.map((team) => `/${team.name}/dist/catalog.js`);
  const state: CeAssetState = {
    code: teams.flatMap((team) => [
      `/${team.name}/dist/chunks/`,
      `/${team.name}/dist/catalog.js`,
    ]),
    roots: ROOTS,
    missing: new Set<string>(),
  };
  const renderer = new ServerRenderer({
    logLevel: ServerRendererLogLevelEnum.error,
    worker: { disable: true },
    render: { maxConcurrency: 1, setupScript: ceSetupScript(catalogs) },
    browser: ceBrowserSettings(createAssetResponder(state)),
  });
  // No `outputFile`: a render that is only being measured writes nothing.
  const items = jobs.map((job) => ({ url: job.page.url, html: job.page.html }));
  let results: { error?: string }[] = [];
  let wall = 0;

  try {
    wall = await timed(async () => {
      results = await renderer.render(items);
    });
  } finally {
    await renderer.close();
  }

  return {
    wall,
    perPage: wall / (jobs.length || 1),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
}

/**
 * What one render is made of, each step including the step above it.
 *
 * Every step is measured `samples` times and reported by its median: the first render of anything
 * in a process pays for code that is not compiled yet, which is noise when the question is what a
 * render costs.
 */
async function breakdownFor(team: Team, job: Job, samples: number): Promise<Breakdown> {
  const renderer: number[] = [];
  const floor: number[] = [];
  const page: number[] = [];
  const styles: number[] = [];

  for (let sample = 0; sample < samples; sample += 1) {
    renderer.push(await timed(() => buildAndClose(job)));
    // An empty document still pays for the window, the setup script - which loads every component
    // the catalog declares, used or not - and the serialization. Whatever a real page adds on top
    // of that is the only part of a render its own markup can influence.
    floor.push(await timed(() => ceRenderToString(EMPTY_PAGE, job.manifest, job.catalog, job.options)));

    const started = performance.now();
    const rendered = await renderPage(job);

    page.push(performance.now() - started);
    styles.push(
      await timed(async () => withStylesheets(rendered, stylesFor(rendered, job.manifest, job.catalog))),
    );
  }

  return {
    renderer: stats(renderer).median,
    floor: stats(floor).median,
    page: stats(page).median,
    styles: stats(styles).median,
  };
}

/* ------------------------------------------------------------------- report -- */

/** A duration, at a width that lines up in a table */
function ms(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)}ms`;
}

/** A number with a sign, for a speedup */
function times(value: number): string {
  return `${value.toFixed(2)}x`;
}

/** What a run measured */
export interface BenchReport {
  pages: number;
  iterations: number;
  /** Cores the machine has, so a concurrency speedup can be read against what it could reach */
  cores: number;
  /** Every page's timings, keyed by the path that was rendered */
  paths: { team: string; path: string; stats: Stats }[];
  teams: { name: string; pages: number; stats: Stats; breakdown: Breakdown }[];
  overall: Stats;
  /** The first pass over every page, which is the cold one */
  first: Stats;
  /** Every pass after it, which is what a warm process sees */
  steady: Stats;
  slowest: { team: string; path: string; median: number }[];
  concurrency: { limit: number; wall: number; speedup: number } | null;
  /** Every page through one renderer, and what each page paid for it */
  batched: (BatchedPass & { speedup: number }) | null;
}

/* ---------------------------------------------------------------------- api -- */

/** What a run was asked for */
export interface BenchOptions {
  /** Teams to render, all of them by default */
  teams?: string[];
  /** Passes over every page, so a warm render can be told from a cold one */
  iterations?: number;
  /** Pages rendered at once, 0 to skip that pass */
  concurrency?: number;
  /** Samples per step of the breakdown, reported by their median */
  samples?: number;
  /** Pages to render at most, 0 for every page the build has */
  limit?: number;
}

/**
 * Measures what rendering the built pages costs.
 *
 * The pages are the ones the prerender pass writes, so this is the workload the build runs, and
 * the numbers move when the build does.
 */
export async function bench(options: BenchOptions = {}): Promise<BenchReport> {
  const iterations = options.iterations ?? 3;
  const concurrency = options.concurrency ?? 4;
  const samples = options.samples ?? 5;
  const named = options.teams ?? [];
  const teams = named.length ? TEAMS.filter((team) => named.includes(team.name)) : TEAMS;

  if (!teams.length) throw new Error(`No team to render: ${named.join(", ") || "none named"}`);

  const jobs = await workload(teams);
  const limited = options.limit ? jobs.slice(0, options.limit) : jobs;

  if (!limited.length) throw new Error("No page to render");

  const { samples: timings, walls } = await oneShot(limited, iterations);
  const perPage = limited.map((job, index) => ({
    team: job.page.team,
    path: job.page.path,
    stats: stats(timings[index]),
  }));

  const byTeam = new Map<string, number[]>();

  for (const [index, job] of limited.entries()) {
    byTeam.set(job.page.team, [...(byTeam.get(job.page.team) ?? []), ...timings[index]]);
  }

  const perTeam: BenchReport["teams"] = [];

  for (const team of teams) {
    const pages = perPage.filter((page) => page.team === team.name);
    const job = limited.find((candidate) => candidate.page.team === team.name);

    if (!pages.length || !job) continue;

    perTeam.push({
      name: team.name,
      pages: pages.length,
      stats: stats(byTeam.get(team.name) ?? []),
      // One page stands for the team: the breakdown is about what the team's catalog and
      // stylesheets cost, and every page of that team pays those.
      breakdown: await breakdownFor(team, job, samples),
    });
  }

  const iteration = (index: number) =>
    limited.flatMap((_, page) => timings[page][index] ?? []);
  const first = stats(iteration(0));
  const steady = iterations > 1 ? stats(iteration(1)) : first;

  const wall = concurrency > 0 ? await timed(() => pooled(limited, concurrency, renderPage)) : 0;
  const batched = await batchedPass(limited, teams);

  return {
    pages: limited.length,
    iterations,
    cores: OS.cpus().length,
    paths: perPage,
    teams: perTeam,
    overall: stats(timings.flat()),
    first,
    steady,
    slowest: [...perPage]
      .sort((a, b) => b.stats.median - a.stats.median)
      .slice(0, 5)
      .map(({ team, path, stats: page }) => ({ team, path, median: page.median })),
    concurrency:
      concurrency > 0
        ? { limit: concurrency, wall, speedup: (walls.at(-1) ?? wall) / wall }
        : null,
    batched: { ...batched, speedup: (walls.at(-1) ?? batched.wall) / batched.wall },
  };
}

/* ------------------------------------------------------------------- output -- */

/** What the command line asked for, on top of the defaults `bench` uses */
function parseArgs(args: string[]): BenchOptions & { json: boolean } {
  const options: BenchOptions & { json: boolean } = { json: false };

  for (const arg of args) {
    const [flag, value = ""] = arg.split("=");

    switch (flag) {
      case "--team":
        options.teams = [...(options.teams ?? []), ...value.split(",").filter(Boolean)];
        break;
      case "--iterations":
        options.iterations = Number(value);
        break;
      case "--concurrency":
        options.concurrency = Number(value);
        break;
      case "--samples":
        options.samples = Number(value);
        break;
      case "--pages":
        options.limit = Number(value);
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(
          `Unknown option "${arg}". Options: --team=explore,decide --iterations=3 ` +
            `--concurrency=4 --samples=5 --pages=31 --json`,
        );
    }
  }

  return options;
}

/** A table row, each cell padded to the column's width */
function row(widths: number[], cells: string[]): string {
  return cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(" ").trimEnd();
}

/** Prints what the run measured, or the whole report as json */
function print(report: BenchReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const overall = report.overall;
  const line = (label: string, value: string) => console.log(`  ${label.padEnd(14)}${value}`);

  console.log(`\nceRenderToString - ${report.pages} pages, ${report.iterations} passes\n`);
  line("total", `${ms(overall.total)} for ${overall.n} renders`);
  line("throughput", `${(1000 / overall.mean).toFixed(1)} renders a second`);
  line(
    "per render",
    `median ${ms(overall.median)}, mean ${ms(overall.mean)}, p95 ${ms(overall.p95)}, max ${ms(overall.max)}`,
  );
  line("cold vs warm", `${ms(report.first.mean)} on the first pass, ${ms(report.steady.mean)} after`);

  const teamWidths = [14, 6, 9, 9, 9, 9, 9];
  const teamRow = (cells: string[]) => console.log(`  ${row(teamWidths, cells)}`);

  console.log("\n  by team");
  teamRow(["team", "pages", "min", "median", "mean", "p95", "max"]);

  for (const team of report.teams) {
    teamRow([
      team.name,
      String(team.pages),
      ms(team.stats.min),
      ms(team.stats.median),
      ms(team.stats.mean),
      ms(team.stats.p95),
      ms(team.stats.max),
    ]);
  }

  const partWidths = [14, 11, 15, 11, 13];
  const partRow = (cells: string[]) => console.log(`  ${row(partWidths, cells)}`);

  console.log("\n  where the time goes (median, one page per team)");
  partRow(["team", "renderer", "empty page", "page", "stylesheets"]);

  for (const team of report.teams) {
    const { renderer, floor, page: whole, styles } = team.breakdown;

    partRow([
      team.name,
      ms(renderer),
      `${ms(floor)} ${Math.round((floor / whole) * 100)}%`,
      ms(whole),
      ms(styles),
    ]);
  }

  console.log("  (the empty page is the floor every render pays: window, catalog setup, serialize)");

  console.log("\n  slowest pages (median)");
  for (const { path, median } of report.slowest) {
    console.log(`  ${ms(median).padStart(8)}  ${path}`);
  }

  if (report.concurrency) {
    const { limit, wall, speedup } = report.concurrency;

    console.log(
      `\n  concurrency  ${limit} at a time on ${report.cores} cores: ${ms(wall)} for ` +
        `${report.pages} pages, ${times(speedup)} one at a time`,
    );
  }

  if (report.batched) {
    const { wall, perPage, speedup, errors } = report.batched;

    console.log(
      `  one renderer  ${report.pages} pages in ${ms(wall)}: ${ms(perPage)} a page, ` +
        `${times(speedup)} one at a time`,
    );

    if (errors.length) console.log(`  render errors  ${errors.length}, first: ${errors[0]}`);
  }

  console.log("");
}

/** Runs the benchmark for the command line */
async function main(args: string[]): Promise<void> {
  const { json, ...options } = parseArgs(args);

  print(await bench(options), json);
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`[bench] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
