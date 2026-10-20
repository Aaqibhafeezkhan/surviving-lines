#!/usr/bin/env node
// Run every probe on its fixture and write docs/COMPARISON.md. `--stdout` prints instead of writing.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFixture, removeRepo } from "../fixtures.mjs";
import { ROOT, UPSTREAM } from "./adapters.mjs";
import { LOSSES, PROBES } from "./probes.mjs";
import { renderComparison } from "./report.mjs";

const fetched = existsSync(join(UPSTREAM, "FETCHED.json")) ? JSON.parse(readFileSync(join(UPSTREAM, "FETCHED.json"), "utf8")).tools : {};
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

/** @type {{ name: string, version: string, license: string, note: string }[]} */
const tools = [{ name: "surviving-lines", version: `${pkg.version} (commit ${head})`, license: "MIT", note: "this repository" }];
const NOTES = { "git-fame": "oracle only: run, never copied", "git-who": "run; `table` and `tree`", "git-extras": "run `git summary --line`", "git-truck": "installed; a browser tool with no printed numbers", hercules: "build attempted" };
for (const [name, t] of Object.entries(fetched)) {
  const v = /** @type {Record<string, string>} */ (t);
  tools.push({ name, version: v.status === "ok" ? `${v.version}${v.commit ? ` (commit ${v.commit.slice(0, 8)})` : ""}` : "not installed", license: v.license ?? "-", note: v.status === "ok" ? NOTES[/** @type {keyof typeof NOTES} */ (name)] ?? "" : `failed: ${v.reason}` });
}

const gitVersion = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
const results = [];
for (const probe of PROBES) {
  const dirs = [];
  const build = (/** @type {Parameters<typeof buildFixture>[0]} */ name) => { const d = buildFixture(name); dirs.push(d); return d; };
  try {
    const dir = build(probe.fixture);
    results.push({ probe, outcome: probe.run({ dir, build }) });
  } catch (e) {
    results.push({ probe, outcome: { verdict: /** @type {const} */ ("not-run"), ours: "-", theirs: "-", note: `probe failed: ${e instanceof Error ? e.message : e}` } });
  } finally {
    for (const d of dirs) removeRepo(d);
  }
}

const doc = renderComparison({ date: new Date().toISOString().slice(0, 10), machine: `${process.platform} ${process.arch}, node ${process.version}, ${gitVersion}`, tools, results, losses: LOSSES });
if (process.argv.includes("--stdout")) console.log(doc);
else writeFileSync(join(ROOT, "docs", "COMPARISON.md"), doc);
