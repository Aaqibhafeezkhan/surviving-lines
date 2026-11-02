// @ts-check
// Trust pass 2026-11-02: attribution fixtures with a known answer. Each test names the wrong result it pins.
// Repositories are built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRepo, commitAsIdentity, removeRepo, lines } from "../scripts/fixtures.mjs";

const BIN = fileURLToPath(new URL("../bin/surviving-lines.js", import.meta.url));
const { parseArgs, analyse, linkIdentities } = await import("../bin/surviving-lines.js");

/** @param {number} i */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} fn */
async function withRepo(build, fn) {
  const dir = createRepo("sl-trust-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

/** @param {string} dir @param {string[]} args @returns {{ out: string, err: string }} */
function runBoth(dir, args) {
  const r = spawnSync(process.execPath, [BIN, "--cwd", dir, ...args], { encoding: "utf8" });
  return { out: r.stdout, err: r.stderr };
}

test("TA-1: two noreply addresses with different GitHub user ids are two accounts, never linked by a shared login", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Alice", "111+alice@users.noreply.github.com"], day(0), "a", { "a.js": lines("a", 10) });
      commitAsIdentity(dir, ["Dave", "222+alice@users.noreply.github.com"], day(1), "b", { "b.js": lines("b", 10) });
      commitAsIdentity(dir, ["Eve", "eve@example.com"], day(2), "c", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "-q", "--merge-identities"]));
      assert.deepEqual(linkIdentities(r.authors).length, 0);
      assert.equal(r.authors.length, 3, "no merge: each account keeps its own row");
      assert.equal(r.authors.find((a) => a.author === "Dave")?.lines, 10);
    },
  );
});

test("TA-1b: a legacy noreply address (no id) with the same login is still linked to the id form", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Alice", "111+alice@users.noreply.github.com"], day(0), "a", { "a.js": lines("a", 10) });
      commitAsIdentity(dir, ["Alice", "alice@users.noreply.github.com"], day(1), "b", { "b.js": lines("b", 10) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
      assert.equal(linkIdentities(r.authors).length, 1);
    },
  );
});

test("TA-2: a --sample run prints a sampled note on stderr for --csv, so a saved CSV is not mistaken for a full count", async () => {
  await withRepo(
    (dir) => {
      const files = /** @type {Record<string, string>} */ ({});
      for (let i = 0; i < 12; i++) files[`f${i}.js`] = lines(`f${i}`, 10);
      commitAsIdentity(dir, ["Alice", "a@example.com"], day(0), "a", files);
    },
    async (dir) => {
      const sampled = runBoth(dir, ["--csv", "--sample", "3"]);
      assert.match(sampled.err, /sampled run: \d+ of 12 files/);
      assert.match(sampled.err, /--sample 1/);
      const full = runBoth(dir, ["--csv"]);
      assert.doesNotMatch(full.err, /sampled run/);
    },
  );
});

const { isFormatOnlyChange } = await import("../bin/surviving-lines.js");

test("TA-3: a trailing comma added or removed before a closing bracket is layout in JavaScript and TypeScript only", () => {
  assert.equal(isFormatOnlyChange("call(a, b, c);\n", "call(\n  a,\n  b,\n  c,\n);\n", "src/x.ts"), true);
  assert.equal(isFormatOnlyChange("const o = { a: 1, b: 2 };\n", "const o = {\n  a: 1,\n  b: 2,\n};\n", "src/x.js"), true);
  // Python: (1,) is a tuple and (1) is not. JSON: a trailing comma is invalid. Neither is layout.
  assert.equal(isFormatOnlyChange("x = (1)\n", "x = (1,)\n", "a.py"), false);
  assert.equal(isFormatOnlyChange("[1, 2]\n", "[1, 2,]\n", "a.json"), false);
  // Array holes differ from the same array without them.
  assert.equal(isFormatOnlyChange("const a = [];\n", "const a = [,];\n", "a.js"), false);
  assert.equal(isFormatOnlyChange("const a = [1,];\n", "const a = [1,,];\n", "a.js"), false);
  // A comma that is not before a bracket is a real change.
  assert.equal(isFormatOnlyChange("f(a, b)\n", "f(a)\n", "a.js"), false);
});

test("TA-3b: a Prettier-style wrap that adds trailing commas in 15 files is set aside, and the author keeps the lines", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const before = {};
      /** @type {Record<string, string>} */
      const after = {};
      for (let i = 0; i < 15; i++) {
        let b = "";
        let a = "";
        for (let j = 1; j <= 10; j++) {
          b += `call(argA${j}, argB${j}, argC${j});\n`;
          a += `call(\n  argA${j},\n  argB${j},\n  argC${j},\n);\n`;
        }
        before[`f${i}.js`] = b;
        after[`f${i}.js`] = a;
      }
      commitAsIdentity(dir, ["Alice", "a@example.com"], day(0), "init", before);
      commitAsIdentity(dir, ["Bob", "b@example.com"], day(1), "misc cleanup", after);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
      // git's own ignore-rev heuristic leaves a few added lines (a lone closing bracket) on the reformat commit, so
      // the assertion is the share, not an exact count; without the fix Bob holds all 750.
      const alice = r.authors.find((a) => a.author === "Alice")?.lines ?? 0;
      const bob = r.authors.find((a) => a.author === "Bob")?.lines ?? 0;
      assert.ok(alice >= 700 && bob <= 50, `Alice ${alice}, Bob ${bob}`);
    },
  );
});

test("TA-4: a file whose name contains a tab is counted, and does not stop the run", { skip: process.platform === "win32" ? "a tab cannot be in a Windows file name" : false }, async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Alice", "a@example.com"], day(0), "a", { "tab\there.js": lines("t", 7), "plain.js": lines("p", 3) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
      assert.equal(r.authors.find((a) => a.author === "Alice")?.lines, 10);
      assert.equal(r.sample.filesTotal, 2);
    },
  );
});
