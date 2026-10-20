// @ts-check
// Per-extension totals against git-fame --bytype. git-fame has no per-directory view, so --group-by dir has no
// oracle here; scripts/compare records git-who's tree view for it and says the measures differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { runGitFame, runOurs, upstreamProblem } from "../scripts/compare/adapters.mjs";

const skip = upstreamProblem("gitFame") ?? false;

test("--group-by ext gives the same lines per extension as git-fame --bytype", { skip }, () => {
  const dir = buildFixture("dirs");
  try {
    const ours = runOurs(dir, ["--group-by", "ext"]);
    const fame = runGitFame(dir, ["-w", "-M", "--bytype"]);
    assert.equal(ours.status, "ok");
    assert.equal(fame.status, "ok");
    const mine = Object.fromEntries(ours.extra.grouping.groups.map((/** @type {any} */ g) => [g.key, g.lines]));
    const theirs = Object.fromEntries(Object.entries(fame.extra.total).filter(([k]) => k.startsWith(".")).map(([k, v]) => [k, Number(v)]));
    assert.deepEqual(mine, theirs);
  } finally {
    removeRepo(dir);
  }
});
