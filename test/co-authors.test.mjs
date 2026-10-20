// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, parseTrailers, assistantsIn, AI_ASSISTANTS, countBlameByCommit, shareCredit, renderTable, renderAiBreakdown } = await import("../bin/surviving-lines.js");
const rows = (/** @type {any} */ r) => Object.fromEntries(r.authors.map((/** @type {any} */ a) => [a.mail.split("@")[0], [a.lines, a.commits]]));

test("parseTrailers reads Co-authored-by with an address and Assisted-by, from the last paragraph only", () => {
  const t = parseTrailers("fix: x\n\nBody text.\n\nCo-authored-by: Ada L <ADA@Example.com>\nco-authored-by: Bob <bob@example.com>\nAssisted-by: AGENT:model-1 tool\nSigned-off-by: Cy <cy@example.com>");
  assert.deepEqual(t.coAuthors, [{ name: "Ada L", mail: "ada@example.com" }, { name: "Bob", mail: "bob@example.com" }]);
  assert.deepEqual(t.assistedBy, ["AGENT:model-1 tool"]);
});

test("parseTrailers does not read prose, a lone subject, a missing address or a middle paragraph", () => {
  assert.deepEqual(parseTrailers("Co-authored-by: Ada <ada@example.com>"), { coAuthors: [], assistedBy: [] });
  assert.deepEqual(parseTrailers("x\n\nCo-authored-by: Ada <ada@example.com> is mentioned.\n\nSigned-off-by: Cy <cy@example.com>"), { coAuthors: [], assistedBy: [] });
  assert.deepEqual(parseTrailers("x\n\nCo-authored-by: Ada without an address"), { coAuthors: [], assistedBy: [] });
  assert.deepEqual(parseTrailers("x\n\nAssisted-by:"), { coAuthors: [], assistedBy: [] });
  assert.deepEqual(parseTrailers("x\r\n\r\nCo-authored-by: Ada <ada@example.com>\r\n").coAuthors, [{ name: "Ada", mail: "ada@example.com" }]);
});

test("every documented assistant is recognised from its own example, and nothing else is", () => {
  assert.ok(AI_ASSISTANTS.length >= 1);
  assert.ok(AI_ASSISTANTS.some((a) => a.name === "Claude"));
  for (const a of AI_ASSISTANTS) {
    assert.match(a.source, /^https:\/\//, `${a.name} must cite a source`);
    const t = parseTrailers(`x\n\nCo-authored-by: ${a.example}`);
    assert.deepEqual(assistantsIn(t), [a.name], a.name);
  }
  assert.deepEqual(assistantsIn(parseTrailers("x\n\nCo-authored-by: Mallory <mallory@example.com>")), []);
  assert.deepEqual(assistantsIn(parseTrailers("x\n\nAssisted-by: AGENT_NAME:model-2 [tool]")), ["AGENT_NAME"]);
  assert.deepEqual(assistantsIn(parseTrailers("x\n\nAssisted-by: Foo\nAssisted-by: Foo:v2")), ["Foo"]);
});

test("countBlameByCommit counts lines per commit id from line-porcelain", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  const porcelain = [`${a} 1 1 2`, "author Ada", "author-mail <Ada@Example.com>", "\tone", `${a} 2 2`, "author Ada", "author-mail <Ada@Example.com>", "\ttwo", `${b} 1 3 1`, "author Bob", "author-mail <bob@example.com>", "\tthree"].join("\n");
  assert.deepEqual([...countBlameByCommit(porcelain)], [[a, { name: "Ada", mail: "ada@example.com", lines: 2 }], [b, { name: "Bob", mail: "bob@example.com", lines: 1 }]]);
});

test("shareCredit splits a commit's lines and the commit itself equally, deduplicating the author", () => {
  const blamed = new Map([["c1", { name: "Bob", mail: "bob@x", lines: 9 }]]);
  const window = [{ sha: "c1", mail: "bob@x", name: "Bob" }, { sha: "c2", mail: "bob@x", name: "Bob" }];
  const co = new Map([["c1", [{ name: "Ada", mail: "ada@x" }, { name: "Bob again", mail: "bob@x" }, { name: "Cy", mail: "cy@x" }]]]);
  const out = shareCredit(blamed, window, co);
  assert.deepEqual([...out], [["bob@x", { name: "Bob", lines: 3, commits: 1.333333 }], ["ada@x", { name: "Ada", lines: 3, commits: 0.333333 }], ["cy@x", { name: "Cy", lines: 3, commits: 0.333333 }]]);
});

test("--co-authors share splits lines and commits equally and .mailmap applies to trailer identities", async () => {
  const dir = buildFixture("pairing");
  try {
    const none = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(rows(none), { bob: [27, 4], ada: [11, 1] });
    assert.equal(none.coAuthors, "none");
    assert.doesNotMatch(renderTable(none, 10), /Co-authored-by/);

    const r = await analyse(parseArgs(["--cwd", dir, "--co-authors", "share"]));
    // solo 10 + .mailmap 1 + pair 5 + old address 3 = 19 for Ada; pair 5 + claude 4 + old 3 + prose 3 = 15 for Bob; Claude 4.
    assert.deepEqual(rows(r), { ada: [19, 2], bob: [15, 2.5], noreply: [4, 0.5] });
    assert.equal(r.coAuthors, "share");
    assert.equal(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.lines, 0), r.sample.linesAttributed);
    assert.equal(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.commits, 0), r.commitWindow.commits);
    assert.match(renderTable(r, 10), /merges excluded {2}· {2}Co-authored-by trailers share lines and commits equally$/m);
    // A line in prose that merely starts with the same words credited nobody: Mallory is absent.
    assert.ok(!r.authors.some((/** @type {any} */ a) => a.mail.startsWith("mallory")));
  } finally {
    removeRepo(dir);
  }
});

test("a window cuts the commit side of share mode too", async () => {
  const dir = buildFixture("pairing");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--co-authors", "share", "--since", "2026-01-12T00:00:00Z"]));
    assert.equal(r.commitWindow.commits, 3);
    // Ada shares only the old-address commit (half of it); her lines do not depend on the window.
    assert.deepEqual(rows(r).ada, [19, 0.5]);
  } finally {
    removeRepo(dir);
  }
});

test("--ai-breakdown counts surviving lines and commits whose trailers name an assistant", async () => {
  const dir = buildFixture("coauthor");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--ai-breakdown"]));
    assert.equal(r.coAuthors, "none");
    assert.deepEqual(r.aiAssisted, {
      lines: 12,
      lineShare: 12 / 42,
      commits: 2,
      commitShare: 2 / 6,
      assistants: [{ name: "Claude", lines: 8, commits: 1 }, { name: "AGENT", lines: 4, commits: 1 }],
    });
    // The author table is the ordinary one: this flag adds a block and changes no number.
    assert.deepEqual(rows(r), { bob: [31, 5], ada: [11, 1] });
    const text = /** @type {string} */ (renderAiBreakdown(r, r.sample, r.commitWindow.commits));
    assert.match(text, /^ {2}lines {4}12 of 42 attributed \(28\.6%\)$/m);
    assert.match(text, /^ {2}commits {2}2 of 6 \(33\.3%\)$/m);
    assert.match(text, /Nothing here is guessed from the code\.$/);
    const without = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(without.aiAssisted, null);
    assert.equal(renderAiBreakdown(without, without.sample, 6), null);
  } finally {
    removeRepo(dir);
  }
});

test("share mode and the breakdown leave bots out of both sides", async () => {
  const dir = buildFixture("bots");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--co-authors", "share", "--ai-breakdown"]));
    assert.equal(r.bots.excluded.length, 2);
    assert.equal(r.aiAssisted?.lines, 0);
    assert.equal(r.aiAssisted?.commits, 0);
    assert.equal(r.sample.linesAttributed, 23);
  } finally {
    removeRepo(dir);
  }
});

test("the options that do not combine are refused", () => {
  assert.throws(() => parseArgs(["--co-authors", "split"]), /--co-authors must be none or share/);
  assert.throws(() => parseArgs(["--co-authors"]), /needs a value/);
  assert.throws(() => parseArgs(["--co-authors", "share", "--group-by", "dir"]), /cannot be combined with --group-by yet/);
  assert.throws(() => parseArgs(["--ai-breakdown", "--csv"]), /cannot be combined with --csv or --identities/);
  assert.throws(() => parseArgs(["--ai-breakdown", "--identities"]), /cannot be combined/);
});

test("the CLI prints the breakdown under the table; the JSON matches the schema in both modes", async () => {
  const root = join(import.meta.dirname, "..");
  const schema = JSON.parse(await readFile(join(root, "schema", "surviving-lines.schema.json"), "utf8"));
  const bin = join(root, "bin", "surviving-lines.js");
  const dir = buildFixture("coauthor");
  try {
    const text = spawnSync(process.execPath, [bin, "--cwd", dir, "--co-authors", "share", "--ai-breakdown", "-q"], { encoding: "utf8" });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^AI-assisted, counted from commit trailers/m);
    for (const extra of [["--co-authors", "share", "--ai-breakdown"], ["--ai-breakdown"], []]) {
      const run = spawnSync(process.execPath, [bin, "--cwd", dir, "--json", "-q", ...extra], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(schemaErrors(schema, JSON.parse(run.stdout)), [], extra.join(" "));
    }
  } finally {
    removeRepo(dir);
  }
});
