// @ts-check
// Trust pass 2026-11-02, item 7: --svg prints one shareable card from the same analysis as the table. Deterministic,
// no dependency, every name escaped, and the card says what it is a picture of.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRepo, commitAsIdentity, removeRepo, lines } from "../scripts/fixtures.mjs";

const BIN = fileURLToPath(new URL("../bin/surviving-lines.js", import.meta.url));
const { renderSvg } = await import("../bin/surviving-lines.js");
const day = (/** @type {number} */ i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {(dir: string) => void} fn */
function withRepo(fn) {
  const dir = createRepo("sl-svg-");
  try {
    // 60 files in three commits (Ada 40, Bob 14, Cy 6), so a 1-in-2 sample still splits into four sub-samples.
    const batch = (/** @type {string} */ who, /** @type {number} */ from, /** @type {number} */ to) => Object.fromEntries(Array.from({ length: to - from }, (_, k) => [`src/${who}${from + k}.js`, lines(`${who}${from + k}`, 10)]));
    commitAsIdentity(dir, ["Ada", "ada@x.test"], day(0), "ada", batch("a", 0, 40));
    commitAsIdentity(dir, ["Bob", "bob@y.test"], day(1), "bob", batch("b", 0, 14));
    commitAsIdentity(dir, ["Cy", "cy@z.test"], day(2), "cy", batch("c", 0, 6));
    fn(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} args */
const cli = (dir, args) => spawnSync(process.execPath, [BIN, "--cwd", dir, "-q", ...args], { encoding: "utf8" });

/**
 * A small well-formedness check, since the repository has no XML parser: balanced tags, quoted attributes, only the
 * five entities (or numeric ones), no raw & or < in text, no character XML 1.0 forbids. Returns the element names seen.
 * @param {string} xml @returns {string[]}
 */
function wellFormed(xml) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the test looks for exactly these characters
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u, "no forbidden control characters");
  const names = [];
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);[^"<&]*)*")*)\s*(\/?)>|<\?xml[^>]*\?>|<!--[\s\S]*?-->|([^<]+)/gu;
  let at = 0;
  for (const m of xml.matchAll(re)) {
    assert.equal(m.index, at, `unparsed markup at ${at}: ${xml.slice(at, at + 60)}`);
    at = m.index + m[0].length;
    if (m[5] !== undefined) {
      assert.doesNotMatch(m[5].replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, ""), /&/, "a raw & in text");
    } else if (m[2]) {
      if (!m[1]) names.push(m[2]);
      if (m[1]) assert.equal(stack.pop(), m[2], "balanced");
      else if (!m[4]) stack.push(m[2]);
    }
  }
  assert.equal(at, xml.length);
  assert.deepEqual(stack, []);
  return names;
}
/** The text of every element, tags removed, entities decoded. @param {string} xml */
const text = (xml) => xml.replace(/<[^>]*>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

test("SV-1: a full run gives a well-formed card with scope, ref, date, complete and the not-a-score line", () => {
  withRepo((dir) => {
    const svg = cli(dir, ["--svg"]).stdout;
    assert.match(svg, /^<svg /);
    const names = wellFormed(svg);
    assert.ok(names.includes("title") && names.includes("desc"), "accessible title and description");
    const t = text(svg);
    assert.match(t, /whole repository/);
    assert.match(t, /ref HEAD/);
    assert.match(t, /as of 2026-01-03/);
    assert.match(t, /complete: every file was read/);
    assert.match(t, /not a quality or productivity score/);
    assert.doesNotMatch(svg, /\u2014/, "no em dash in public text");
  });
});

test("SV-2: every number on the card equals the JSON of the same run (shares, commit shares, difference)", () => {
  withRepo((dir) => {
    const svg = cli(dir, ["--svg"]).stdout;
    const doc = JSON.parse(cli(dir, ["--json"]).stdout);
    const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
    for (const a of doc.authors) {
      const row = new RegExp(`<g class="row" data-mail="${a.mail}">([\\s\\S]*?)</g>`).exec(svg);
      assert.ok(row, `row for ${a.mail}`);
      const t = text(row[1]);
      assert.ok(t.includes(`${pct(a.lineShare)} of lines`), `${a.mail}: ${t}`);
      assert.ok(t.includes(`${pct(a.commitShare)} of commits`), `${a.mail}: ${t}`);
      const diff = (a.lineShare - a.commitShare) * 100;
      assert.ok(t.includes(`${diff >= 0 ? "+" : "-"}${Math.abs(diff).toFixed(1)} points`), `${a.mail}: ${t}`);
    }
  });
});

test("SV-3: a sampled run says SAMPLED with the rate and seed and prints each range from the JSON", () => {
  withRepo((dir) => {
    const args = ["--sample", "2", "--seed", "t"];
    const svg = cli(dir, ["--svg", ...args]).stdout;
    wellFormed(svg);
    const t = text(svg);
    assert.match(t, /SAMPLED: 1 file in 2, seed t/);
    assert.doesNotMatch(t, /complete: every file/);
    assert.match(t, /spread between sub-samples, not a confidence interval/);
    const doc = JSON.parse(cli(dir, ["--json", ...args]).stdout);
    const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
    for (const a of doc.authors) if (a.spread?.low !== null && a.spread) assert.ok(t.includes(`range ${pct(a.spread.low)} to ${pct(a.spread.high)}`), a.mail);
  });
});

test("SV-4: hostile author names are escaped everywhere; no element or attribute can be injected", () => {
  const evil = ['</text><script>alert(1)</script>', '"><svg onload="alert(1)">', "x' onmouseover='alert(1)", "&amp; &lt;b&gt; & <i>", "bell\u0007 nul\u0000 esc\u001b end", "\u202eevil\u202c", "A".repeat(300), "\u{1F600} emoji", "]]> <![CDATA[ x"];
  const authors = evil.map((n, i) => ({ author: n, mail: `${i}"><x onload=1>@e.test`, lines: 100 - i, lineShare: (100 - i) / 1000, commits: 5, commitShare: 0.1, linesWithBlank: 100, shareWithBlank: 0.1 }));
  const r = /** @type {any} */ ({ ref: 'HEAD" onload="x', sample: { every: 1, seed: "", filesTotal: 9, filesSampled: 9, linesInRef: 1000, linesWithBlank: 1000, linesAttributed: 1000, complete: true, spread: null }, authors, activity: { asOf: "2026-01-01" }, commitWindow: { commits: 50, since: null, until: null }, shallow: false, blame: { copyDetection: { on: true } } });
  const svg = renderSvg(r, 20, { paths: ['dir"><script>'], include: ["*.js</text>"], exclude: [] });
  const names = wellFormed(svg);
  assert.deepEqual([...new Set(names)].filter((n) => !["svg", "title", "desc", "style", "rect", "g", "text", "line", "defs", "pattern", "tspan"].includes(n)), [], "only known elements");
  assert.equal(names.filter((n) => n === "svg").length, 1, "one root");
  assert.doesNotMatch(svg, /<script|<x |onload=\\?"[^"]*"[^>]*>(?!<)/);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the test looks for exactly these characters
  assert.doesNotMatch(svg, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  assert.ok(text(svg).includes("alert(1)"), "the name is shown as text, not run");
});

test("SV-5: the card is byte-identical across runs and has no network reference or timestamp", () => {
  withRepo((dir) => {
    const a = cli(dir, ["--svg"]).stdout;
    const b = cli(dir, ["--svg"]).stdout;
    assert.equal(a, b);
    assert.doesNotMatch(a, /href=|<image|<script|url\(http|@import|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    assert.match(a, /prefers-color-scheme: dark/, "readable in light and dark");
  });
});

test("SV-6: --svg is a format of its own: it excludes the other formats and views that print their own text", () => {
  withRepo((dir) => {
    for (const other of [["--json"], ["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--ai-breakdown"], ["--reviewers", "src"]]) {
      const r = cli(dir, ["--svg", ...other]);
      assert.notEqual(r.status, 0, other.join(" "));
      assert.equal(r.stdout, "");
      assert.match(r.stderr, /--svg|--reviewers/);
    }
  });
});
