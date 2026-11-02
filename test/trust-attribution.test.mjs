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
