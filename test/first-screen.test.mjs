// @ts-check
// Pins the first screen and the discoverability text. Each later task of the Phase 2 plan appends tests below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
/** @param {string} f path relative to the repository root */
const read = (f) => readFileSync(join(root, f), "utf8");

export const CATEGORY = "surviving-lines is a command-line tool that counts the lines of code each author still has in a git repository, using git blame, and shows them next to each author's share of commits.";
export const PAIN = "I want to know who wrote the code that is still in this repo, but commit counts only show who was busy, and my own blame scripts credit formatter commits and bots and list one person twice.";

test("the package description is the category sentence", () => {
  assert.equal(JSON.parse(read("package.json")).description, CATEGORY);
});

test("package keywords carry the search phrases and have no duplicates", () => {
  const keywords = JSON.parse(read("package.json")).keywords;
  for (const k of ["git-blame", "git-fame", "git-fame-alternative", "lines-per-author", "lines-of-code", "code-ownership", "codeowners", "authorship", "mailmap", "git-statistics", "cli", "npx"]) {
    assert.ok(keywords.includes(k), `missing keyword ${k}`);
  }
  assert.equal(new Set(keywords).size, keywords.length);
});
