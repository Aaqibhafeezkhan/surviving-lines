// @ts-check
// git-fame 4.2.1 has no option that leaves bots out (its --help lists no author filter). So the check is:
// with --include-bots ours prints what git-fame prints, and by default ours prints that minus the bots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { runGitFame, runOurs, sameNumbers, upstreamProblem } from "../scripts/compare/adapters.mjs";

const skip = upstreamProblem("gitFame") ?? false;

test("--include-bots reproduces git-fame's table; the default is that table without the bot rows", { skip }, () => {
  const dir = buildFixture("bots");
  try {
    const fame = runGitFame(dir, ["-w", "-M"]);
    assert.equal(fame.status, "ok");
    const withBots = runOurs(dir, ["--include-bots"]);
    assert.ok(sameNumbers(withBots.rows, fame.rows, "lines"));
    assert.ok(sameNumbers(withBots.rows, fame.rows, "commits"));

    const people = new Map([...(fame.rows ?? [])].filter(([mail]) => !/\[bot\]@/.test(mail)));
    const ours = runOurs(dir);
    assert.ok(sameNumbers(ours.rows, people, "lines"));
    assert.ok(sameNumbers(ours.rows, people, "commits"));
    assert.ok(fame.rows && fame.rows.size > people.size, "the fixture does have bots in git-fame's table");
  } finally {
    removeRepo(dir);
  }
});

test("git-fame 4.2.1 still has no option to leave bots out; when it gains one this row should become a tie", { skip }, () => {
  const dir = buildFixture("bots");
  try {
    assert.equal(runGitFame(dir, ["--ignore-author", "bot"]).status, "unsupported");
  } finally {
    removeRepo(dir);
  }
});
