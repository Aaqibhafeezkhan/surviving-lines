// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildFixture, createRepo, commitAs, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const root = join(import.meta.dirname, "..");
const bin = join(root, "bin", "surviving-lines.js");
const D = (/** @type {string} */ m, /** @type {string} */ d) => `2026-${m}-${d}T10:00:00Z`;
const run = (/** @type {string} */ dir, /** @type {string[]} */ args) => spawnSync(process.execPath, [bin, "--cwd", dir, ...args], { encoding: "utf8" });

for (const name of ["pairing", "coauthor"]) {
  test(`--sort gap with --co-authors share exits 0 and orders by the gap (${name})`, () => {
    const dir = buildFixture(name);
    try {
      const r = run(dir, ["--sort", "gap", "--co-authors", "share", "--json", "-q"]);
      assert.equal(r.status, 0, r.stderr);
      const j = JSON.parse(r.stdout);
      const gap = (/** @type {any} */ a) => Math.abs(a.lines * j.commitWindow.commits - a.commits * j.sample.linesAttributed);
      const gaps = j.authors.map(gap);
      assert.ok(gaps.length >= 2);
      for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i - 1] >= gaps[i] - 1e-6, `row ${i} out of order: ${gaps}`);
      assert.equal(run(dir, ["--sort", "gap", "--co-authors", "share", "-q"]).status, 0);
    } finally {
      removeRepo(dir);
    }
  });
}

/** Ada 10 solo lines; Bob 10 lines with an Assisted-by trailer and dependabot as co-author. */
function botCoAuthor() {
  const dir = createRepo("sl-botco-");
  commitAs(dir, "ada", D("01", "10"), "ada: solo", { "src/solo.js": lines("solo", 10) });
  commitAs(dir, "bob", D("01", "11"), "bob: assisted\n\nAssisted-by: AGENT:model-1\nCo-authored-by: dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>", { "src/assisted.js": lines("assisted", 10) });
  return dir;
}

test("--ai-breakdown with --co-authors share and a bot co-author keeps numerator and denominator on one basis", async () => {
  const schema = JSON.parse(await readFile(join(root, "schema", "surviving-lines.schema.json"), "utf8"));
  const dir = botCoAuthor();
  try {
    const r = run(dir, ["--co-authors", "share", "--ai-breakdown", "--json", "-q"]);
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.deepEqual(schemaErrors(schema, j), []);
    const ai = j.aiAssisted;
    assert.ok(ai.lineShare <= 1 && ai.commitShare <= 1, JSON.stringify(ai));
    assert.ok(ai.lines <= j.sample.linesAttributed);
    assert.ok(ai.commits <= j.commitWindow.commits);
    // Bob keeps half of the assisted commit; the other half belongs to the excluded bot.
    assert.equal(ai.lines, 5);
    assert.equal(ai.commits, 0.5);
    assert.equal(j.sample.linesAttributed, 15);
    assert.equal(j.commitWindow.commits, 1.5);
    const text = run(dir, ["--co-authors", "share", "--ai-breakdown", "-q"]);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /lines {4}5 of 15 attributed \(33\.3%\)/);
    assert.match(text.stdout, /commits {2}0\.5 of 1\.5 \(33\.3%\)/);
  } finally {
    removeRepo(dir);
  }
});
