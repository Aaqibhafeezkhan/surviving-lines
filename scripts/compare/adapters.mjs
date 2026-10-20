// Run each tool on a repository and reduce what it prints to one shape, so two tools can be compared.
// Nothing here copies code from a competitor: each adapter starts the tool's own executable and
// reads its output. Node built-ins only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");
export const UPSTREAM = join(ROOT, "_upstream");

/** Where fetch.mjs puts each executable. */
export function upstreamPaths() {
  return {
    gitFame: join(UPSTREAM, "git-fame-venv", "bin", "git-fame"),
    gitWho: join(UPSTREAM, "bin", "git-who"),
    gitTruck: join(UPSTREAM, "git-truck", "node_modules", ".bin", "git-truck"),
    hercules: join(UPSTREAM, "bin", "hercules"),
    gitExtrasBin: join(UPSTREAM, "git-extras-src", "bin"),
    ours: join(ROOT, "bin", "surviving-lines.js"),
  };
}

/**
 * Why the differential tests cannot run here, or null when they can. With SL_REQUIRE_UPSTREAM=1 a
 * missing tool is an error instead, so `npm run test:differential` can never pass by skipping.
 * @param {...("gitFame" | "gitWho" | "gitExtrasBin")} tools
 * @returns {string | null}
 */
export function upstreamProblem(...tools) {
  const p = upstreamPaths();
  const missing = tools.filter((t) => !existsSync(p[t]));
  if (missing.length === 0) return null;
  const reason = `${missing.join(", ")} not found under _upstream/; run npm run compare:fetch`;
  if (process.env.SL_REQUIRE_UPSTREAM === "1") throw new Error(reason);
  return reason;
}

/**
 * @typedef {{ lines?: number, commits?: number }} Row
 * @typedef {{ status: "ok" | "unsupported" | "error", rows?: Map<string, Row>, extra?: any, raw?: string, error?: string, ms?: number }} Result
 */

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} cwd
 * @param {Record<string, string>} [env]
 */
function exec(cmd, args, cwd, env = {}) {
  const t0 = performance.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60 * 1000, env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: performance.now() - t0 };
}

const lastLine = (/** @type {string} */ s) => s.trim().split("\n").filter(Boolean).pop() ?? "";

/**
 * surviving-lines with --json. An option this version does not know comes back as "unsupported", which
 * is how the matrix shows a feature we have not built yet.
 * @param {string} dir
 * @param {string[]} [args]
 * @returns {Result}
 */
export function runOurs(dir, args = []) {
  const r = exec(process.execPath, [upstreamPaths().ours, "--cwd", dir, "--json", "-q", ...args], dir);
  if (r.status === 2 && /unknown option/.test(r.stderr)) return { status: "unsupported", error: lastLine(r.stderr), ms: r.ms };
  if (r.status !== 0) return { status: "error", error: lastLine(r.stderr), ms: r.ms };
  const doc = JSON.parse(r.stdout);
  /** @type {Map<string, Row>} */
  const rows = new Map(doc.authors.map((/** @type {any} */ a) => [a.mail, { lines: a.lines, commits: a.commits }]));
  return { status: "ok", rows, extra: doc, ms: r.ms };
}

/**
 * git-fame as a black box, JSON format, authors shown by address.
 * @param {string} dir
 * @param {string[]} [args]
 * @returns {Result}
 */
export function runGitFame(dir, args = []) {
  const bin = upstreamPaths().gitFame;
  if (!existsSync(bin)) return { status: "error", error: "git-fame is not installed (npm run compare:fetch)" };
  const r = exec(bin, ["-s", "-e", "--format=json", ...args, dir], dir);
  if (r.status === 2 && /unrecognized arguments/.test(r.stderr)) return { status: "unsupported", error: lastLine(r.stderr), ms: r.ms };
  if (r.status !== 0) return { status: "error", error: lastLine(r.stderr), ms: r.ms };
  const doc = JSON.parse(r.stdout.trim().split("\n").pop() ?? "{}");
  /** @type {Map<string, Row>} */
  const rows = new Map(doc.data.map((/** @type {any[]} */ d) => [String(d[0]).toLowerCase(), { lines: d[1], commits: d[2] }]));
  return { status: "ok", rows, extra: doc, ms: r.ms };
}

/**
 * Whether git-fame can print one of its --format values on this repository.
 * @param {string} dir
 * @param {string} format
 * @returns {boolean}
 */
export function gitFamePrints(dir, format) {
  const bin = upstreamPaths().gitFame;
  if (!existsSync(bin)) return false;
  return exec(bin, ["-s", "-e", `--format=${format}`, dir], dir).status === 0;
}

/**
 * git-who table, CSV: commits per author. It counts edits, not surviving lines, so only commits are compared.
 * @param {string} dir
 * @returns {Result}
 */
export function runGitWho(dir) {
  const bin = upstreamPaths().gitWho;
  if (!existsSync(bin)) return { status: "error", error: "git-who is not installed (npm run compare:fetch)" };
  const r = exec(bin, ["table", "-csv", "-e", "-n", "0"], dir);
  if (r.status !== 0) return { status: "error", error: lastLine(r.stderr), ms: r.ms };
  const [head, ...body] = r.stdout.trim().split("\n");
  const cols = head.split(",");
  const iMail = cols.indexOf("email");
  const iCommits = cols.indexOf("commits");
  /** @type {Map<string, Row>} */
  const rows = new Map(body.map((l) => { const c = l.split(","); return [c[iMail].toLowerCase(), { commits: Number(c[iCommits]) }]; }));
  return { status: "ok", rows, raw: r.stdout, ms: r.ms };
}

/**
 * git-who tree: which author leads each path. Returned raw; the matrix records that it ran and that it ranks by edits.
 * @param {string} dir
 * @returns {Result}
 */
export function runGitWhoTree(dir) {
  const bin = upstreamPaths().gitWho;
  if (!existsSync(bin)) return { status: "error", error: "git-who is not installed (npm run compare:fetch)" };
  const r = exec(bin, ["tree", "-e"], dir, { NO_COLOR: "1" });
  if (r.status !== 0) return { status: "error", error: lastLine(r.stderr), ms: r.ms };
  return { status: "ok", raw: r.stdout, ms: r.ms };
}

/**
 * git-extras `git summary --line`: lines per author name, from a plain blame tally. Rows are keyed by name.
 * @param {string} dir
 * @returns {Result}
 */
export function runGitExtras(dir) {
  const bin = upstreamPaths().gitExtrasBin;
  if (!existsSync(bin)) return { status: "error", error: "git-extras is not installed (npm run compare:fetch)" };
  const r = exec("git", ["summary", "--line"], dir, { PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}` });
  if (r.status !== 0) return { status: "error", error: lastLine(r.stderr), ms: r.ms };
  /** @type {Map<string, Row>} */
  const rows = new Map();
  for (const l of r.stdout.split("\n")) {
    const m = /^\s+(\d+)\s+(.+?)\s+[\d.]+%\s*$/.exec(l);
    if (m) rows.set(m[2].toLowerCase(), { lines: Number(m[1]) });
  }
  return { status: "ok", rows, raw: r.stdout, ms: r.ms };
}

/**
 * Whether a tool that has no comparable output was fetched, and what FETCHED.json says about it.
 * @param {"git-truck" | "hercules"} name
 * @returns {{ ran: boolean, note: string }}
 */
export function fetchedStatus(name) {
  const file = join(UPSTREAM, "FETCHED.json");
  if (!existsSync(file)) return { ran: false, note: "not fetched (npm run compare:fetch)" };
  const t = JSON.parse(readFileSync(file, "utf8")).tools?.[name];
  if (!t) return { ran: false, note: "not fetched" };
  return t.status === "ok" ? { ran: true, note: `installed ${t.version}` } : { ran: false, note: `could not be installed: ${t.reason}` };
}

/** @param {Map<string, Row> | undefined} rows @param {"lines" | "commits"} field @returns {string} */
export function compact(rows, field) {
  if (!rows) return "-";
  return [...rows.entries()].map(([k, v]) => `${k.split("@")[0]}=${v[field] ?? "?"}`).join(", ");
}

/**
 * Whether two result sets hold the same number for every key, ignoring keys on only one side when `onlyShared`.
 * @param {Map<string, Row> | undefined} a
 * @param {Map<string, Row> | undefined} b
 * @param {"lines" | "commits"} field
 * @param {{ tolerance?: number }} [opts]
 */
export function sameNumbers(a, b, field, opts = {}) {
  if (!a || !b) return false;
  const tol = opts.tolerance ?? 1e-9;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const x = a.get(k)?.[field] ?? 0;
    const y = b.get(k)?.[field] ?? 0;
    if (Math.abs(x - y) > tol) return false;
  }
  return true;
}
