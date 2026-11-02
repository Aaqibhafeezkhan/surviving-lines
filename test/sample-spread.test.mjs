// @ts-check
// Trust pass 2026-11-02, item 1: a sampled run says it is sampled in every output and shows how far each share moves
// between sub-samples of the files it read. The spread is not a confidence interval, and the output says so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRepo, commitAs, removeRepo, lines } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const BIN = fileURLToPath(new URL("../bin/surviving-lines.js", import.meta.url));
const { parseArgs, analyse, sampleSpread, SPREAD_NOTE } = await import("../bin/surviving-lines.js");
const SCHEMA = JSON.parse(await readFile(new URL("../schema/surviving-lines.schema.json", import.meta.url), "utf8"));

/** @param {number} i */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** 48 files: Ada wrote 36, Bob 10, Charlie 2. @param {string} dir */
function build(dir) {
  const ada = Object.fromEntries(Array.from({ length: 36 }, (_, i) => [`src/a${i}.js`, lines(`a${i}`, 20)]));
  const bob = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`lib/b${i}.js`, lines(`b${i}`, 20)]));
  const charlie = Object.fromEntries(Array.from({ length: 2 }, (_, i) => [`doc/c${i}.js`, lines(`c${i}`, 20)]));
  commitAs(dir, "ada", day(0), "ada", ada);
  commitAs(dir, "bob", day(1), "bob", bob);
  commitAs(dir, "charlie", day(2), "charlie", charlie);
}

/** @param {(dir: string) => Promise<void>} fn */
async function withRepo(fn) {
  const dir = createRepo("sl-spread-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

/** @param {string} dir @param {string[]} args */
const run = (dir, args) => spawnSync(process.execPath, [BIN, "--cwd", dir, "-q", ...args], { encoding: "utf8" });

test("SS-1: a full run says sample.complete true and carries no spread", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.equal(r.sample.complete, true);
    assert.equal(r.sample.spread, null);
    assert.ok(r.authors.every((a) => !("spread" in a)));
  });
});

test("SS-2: a sampled run says sample.complete false and gives every author a range that contains the point share", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--sample", "2", "--seed", "t"]));
    assert.equal(r.sample.complete, false);
    assert.ok(r.sample.spread, "enough files for sub-samples");
    assert.equal(r.sample.spread.note, SPREAD_NOTE);
    assert.match(SPREAD_NOTE, /not a confidence interval/);
    for (const a of r.authors) {
      assert.ok(a.spread, `${a.author} has a spread`);
      assert.ok(a.spread.low <= a.lineShare + 1e-9 && a.lineShare <= a.spread.high + 1e-9, `${a.author}: ${a.spread.low} <= ${a.lineShare} <= ${a.spread.high}`);
      assert.ok(a.spread.files >= 1);
    }
    const ada = r.authors.find((a) => a.author === "Ada");
    assert.ok(ada && ada.spread.high > ada.spread.low, "a real spread, not a point");
  });
});

test("SS-3: too few sampled files for four sub-samples gives no range, and says how few files the share rests on", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--sample", "12", "--seed", "t"]));
    assert.equal(r.sample.complete, false);
    assert.equal(r.sample.spread, null);
    for (const a of r.authors) {
      assert.equal(a.spread.low, null);
      assert.equal(a.spread.high, null);
    }
  });
});

test("SS-4: the JSON of a sampled and of a full run both validate against the schema", async () => {
  await withRepo(async (dir) => {
    for (const args of [[], ["--sample", "2", "--seed", "t"], ["--sample", "12", "--seed", "t"]]) {
      const doc = JSON.parse(run(dir, ["--json", ...args]).stdout);
      assert.deepEqual(schemaErrors(SCHEMA, doc), [], args.join(" "));
    }
  });
});

test("SS-5: table, markdown and CSV of a sampled run show the range with its label; a full run shows none", async () => {
  await withRepo(async (dir) => {
    const sampled = ["--sample", "2", "--seed", "t"];
    const table = run(dir, sampled).stdout;
    assert.match(table, /range/);
    assert.match(table, /spread between sub-samples, not a confidence interval/);
    const md = run(dir, ["--markdown", ...sampled]).stdout;
    assert.match(md, /\| line share range \|/);
    assert.match(md, /spread between sub-samples, not a confidence interval/);
    const csv = run(dir, ["--csv", ...sampled]);
    assert.match(csv.stdout.split("\n")[0], /line_share_low,line_share_high,files/);
    assert.match(csv.stderr, /spread between sub-samples, not a confidence interval/);
    for (const full of [run(dir, []).stdout, run(dir, ["--markdown"]).stdout, run(dir, ["--csv"]).stdout]) {
      assert.doesNotMatch(full, /range|line_share_low|sub-samples/);
    }
  });
});

test("SS-6: the numbers in the table range equal the JSON range", async () => {
  await withRepo(async (dir) => {
    const doc = JSON.parse(run(dir, ["--json", "--sample", "2", "--seed", "t"]).stdout);
    const ada = doc.authors.find((/** @type {any} */ a) => a.author === "Ada");
    const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
    const md = run(dir, ["--markdown", "--sample", "2", "--seed", "t"]).stdout;
    const row = md.split("\n").find((l) => l.startsWith("| Ada "));
    assert.ok(row?.includes(`${pct(ada.spread.low)}`) && row.includes(`${pct(ada.spread.high)}`), row);
  });
});

test("SS-7: sampleSpread is deterministic and its range always contains the pooled share", () => {
  /** @type {Map<string, Map<string, { name: string, lines: number }>>} */
  const perFile = new Map();
  for (let i = 0; i < 40; i++) perFile.set(`f${i}.js`, new Map([["a@x", { name: "A", lines: 10 + (i % 7) }], ["b@x", { name: "B", lines: i % 5 }]]));
  const one = sampleSpread(perFile, (m) => m, new Set());
  const two = sampleSpread(perFile, (m) => m, new Set());
  assert.deepEqual(JSON.parse(JSON.stringify(one)), JSON.parse(JSON.stringify(two)));
  assert.ok(one);
  let a = 0;
  let total = 0;
  for (const c of perFile.values()) for (const [m, v] of c) { total += v.lines; if (m === "a@x") a += v.lines; }
  const got = one.authors.get("a@x");
  assert.ok(got && got.low <= a / total && a / total <= got.high);
});

test("SS-8: the sub-samples stay balanced under every --sample rate (a second FNV-1a tied to the first left half of them empty with --sample 2)", async () => {
  const { inSample, SPREAD_SUB_SAMPLES } = await import("../bin/surviving-lines.js");
  for (const n of [2, 3, 4, 5, 8]) {
    /** @type {Map<string, Map<string, { lines: number }>>} */
    const perFile = new Map();
    for (let i = 0; i < 2000; i++) if (inSample(`src/dir${i % 17}/file${i}.js`, n, "seed")) perFile.set(`src/dir${i % 17}/file${i}.js`, new Map([["a@x", { lines: 1 }]]));
    const got = sampleSpread(perFile, (m) => m, new Set());
    assert.ok(got, `--sample ${n} gives sub-samples`);
    const mean = perFile.size / SPREAD_SUB_SAMPLES;
    for (const size of got.filesPerSubSample) assert.ok(size > mean * 0.7 && size < mean * 1.3, `--sample ${n}: ${got.filesPerSubSample}`);
  }
});
