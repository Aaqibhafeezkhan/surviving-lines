#!/usr/bin/env node
// Fetch the competitors into the gitignored _upstream/ directory at the versions pinned in
// versions.json, and record what was actually obtained in _upstream/FETCHED.json. Safe to run again:
// a tool whose pinned version is already present is left alone. A tool that fails to install is
// recorded as failed with the reason, and the comparison reports it as "not run".
//
// git-fame is MPL-2.0: it is installed and run, and nothing from it is copied into this repository.
// It is installed with its yaml extra so the comparison does not call a format missing that it has.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UPSTREAM, upstreamPaths } from "./adapters.mjs";

const versions = JSON.parse(readFileSync(join(import.meta.dirname, "versions.json"), "utf8"));
const paths = upstreamPaths();
mkdirSync(UPSTREAM, { recursive: true });
mkdirSync(join(UPSTREAM, "bin"), { recursive: true });

/** @param {string} cmd @param {string[]} args @param {import("node:child_process").ExecFileSyncOptions} [opts] */
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15 * 60 * 1000, ...opts });
const firstLine = (/** @type {string} */ file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").find((l) => l.trim()) ?? "" : "");
const short = (/** @type {unknown} */ e) => String((e && typeof e === "object" && "stderr" in e && e.stderr) || (e instanceof Error ? e.message : e)).trim().split("\n").slice(-3).join(" | ").slice(0, 300);

/** @type {Record<string, Record<string, string>>} */
const record = {};

/** @param {string} name @param {() => Record<string, string>} step */
function attempt(name, step) {
  try {
    record[name] = { status: "ok", ...step() };
  } catch (e) {
    record[name] = { status: "failed", reason: short(e) };
  }
  console.log(`${name}: ${record[name].status}${record[name].reason ? ` (${record[name].reason})` : ""}`);
}

/** @param {{ repo: string, tag: string }} v @param {string} dir */
function cloneAt(v, dir) {
  if (!existsSync(dir)) run("git", ["clone", "--quiet", "--depth", "1", "--branch", v.tag, v.repo, dir]);
  return run("git", ["rev-parse", "HEAD"], { cwd: dir }).trim();
}

attempt("git-fame", () => {
  const v = versions["git-fame"];
  if (!existsSync(paths.gitFame)) {
    run("python3", ["-m", "venv", join(UPSTREAM, "git-fame-venv")]);
    run(join(UPSTREAM, "git-fame-venv", "bin", "pip"), ["install", "--quiet", `git-fame[yaml]==${v.version}`]);
  }
  const got = run(paths.gitFame, ["--version"]).trim();
  if (got !== v.version) throw new Error(`git-fame reports ${got}, pinned ${v.version}`);
  return { version: got, license: v.license };
});

attempt("git-who", () => {
  const v = versions["git-who"];
  const dir = join(UPSTREAM, "git-who-src");
  const commit = cloneAt(v, dir);
  if (!existsSync(paths.gitWho)) run("go", ["build", "-o", paths.gitWho, "."], { cwd: dir });
  return { version: v.tag, commit, license: firstLine(join(dir, "LICENSE")) };
});

attempt("git-extras", () => {
  const v = versions["git-extras"];
  const dir = join(UPSTREAM, "git-extras-src");
  const commit = cloneAt(v, dir);
  return { version: v.tag, commit, license: firstLine(join(dir, "LICENSE")) };
});

attempt("git-truck", () => {
  const v = versions["git-truck"];
  const dir = join(UPSTREAM, "git-truck");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(paths.gitTruck)) run("npm", ["install", "--prefix", dir, `${v.npm}@${v.version}`, "--no-audit", "--no-fund"]);
  const got = run(paths.gitTruck, ["--version"]).trim();
  return { version: v.version, reported: got, license: v.license };
});

attempt("hercules", () => {
  // Written against libgit2 in 2020. It is expected to fail on a current toolchain; a failure is a result.
  const v = versions.hercules;
  const dir = join(UPSTREAM, "hercules-src");
  const commit = cloneAt(v, dir);
  if (!existsSync(paths.hercules)) {
    run("make", [], { cwd: dir });
    run("cp", [join(dir, "hercules"), paths.hercules]);
  }
  return { version: v.tag, commit, license: firstLine(join(dir, "LICENSE")) };
});

writeFileSync(join(UPSTREAM, "FETCHED.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), tools: record }, null, 2) + "\n");
