// @ts-check
// --co-authors share against git-fame --auth share on the same history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { runGitFame, runOurs, sameNumbers, upstreamProblem } from "../scripts/compare/adapters.mjs";

const skip = upstreamProblem("gitFame") ?? false;

test("share mode gives every author the same lines and commits as git-fame --auth share, .mailmap included", { skip }, () => {
  const dir = buildFixture("pairing");
  try {
    const ours = runOurs(dir, ["--co-authors", "share"]);
    const fame = runGitFame(dir, ["-w", "-M", "--auth", "share"]);
    assert.equal(ours.status, "ok");
    assert.equal(fame.status, "ok");
    assert.ok(sameNumbers(ours.rows, fame.rows, "lines", { tolerance: 1e-6 }));
    assert.ok(sameNumbers(ours.rows, fame.rows, "commits", { tolerance: 1e-6 }));
    assert.equal(ours.rows?.get("ada@example.com")?.lines, 19);
  } finally {
    removeRepo(dir);
  }
});

test("an Assisted-by trailer with no address: ours finishes, git-fame 4.2.1 stops with a traceback (recorded as a difference)", { skip }, () => {
  const dir = buildFixture("coauthor");
  try {
    assert.equal(runOurs(dir, ["--co-authors", "share"]).status, "ok");
    const fame = runGitFame(dir, ["-w", "-M", "--auth", "share"]);
    assert.equal(fame.status, "error");
    assert.match(fame.error ?? "", /AttributeError/);
  } finally {
    removeRepo(dir);
  }
});
