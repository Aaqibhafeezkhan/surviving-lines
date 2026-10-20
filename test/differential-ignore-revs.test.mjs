// @ts-check
// Ours against git-fame 4.2.1 on the same repository. git-fame is run as a program; none of its code is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { runGitFame, runOurs, sameNumbers, upstreamProblem } from "../scripts/compare/adapters.mjs";

const skip = upstreamProblem("gitFame") ?? false;

test("a listed reformat commit gives its lines back: ours reads .git-blame-ignore-revs and agrees with git-fame --ignore-revs-file", { skip }, () => {
  const dir = buildFixture("reformat");
  try {
    const ours = runOurs(dir);
    const fame = runGitFame(dir, ["-w", "-M", "--ignore-revs-file", ".git-blame-ignore-revs"]);
    assert.equal(ours.status, "ok");
    assert.equal(fame.status, "ok");
    assert.ok(sameNumbers(ours.rows, fame.rows, "lines"), "ignoring the formatter commit changes lines the same way");
    assert.equal(ours.rows?.get("bob@example.com")?.lines, 0);
  } finally {
    removeRepo(dir);
  }
});

test("without the file both tools hand the reformatted lines to whoever ran the formatter", { skip }, () => {
  const dir = buildFixture("reformat");
  try {
    const ours = runOurs(dir, ["--no-ignore-revs"]);
    const fame = runGitFame(dir, ["-w", "-M"]);
    assert.ok(sameNumbers(ours.rows, fame.rows, "lines"));
    assert.equal(ours.rows?.get("bob@example.com")?.lines, 20);
  } finally {
    removeRepo(dir);
  }
});
