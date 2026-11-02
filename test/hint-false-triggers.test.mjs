// @ts-check
// Trust pass 2026-11-02: the prompt hint must stay silent on general git questions and on coding tasks that only
// contain the words owner, reviewer or git blame; it must still fire on questions about who owns code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SKIP_ON_WINDOWS_SHIM } from "../scripts/fixtures.mjs";

const HOOK = fileURLToPath(new URL("../hooks/surviving-lines-hint.sh", import.meta.url));

/** @param {string} prompt */
function fires(prompt) {
  const r = spawnSync("sh", [HOOK], { input: JSON.stringify({ prompt }), encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: "" } });
  return r.stdout.trim().length > 0;
}

test("HF-1: general git questions and coding tasks with the word owner or reviewer do not fire the hint", SKIP_ON_WINDOWS_SHIM, () => {
  for (const p of [
    "What does git blame do?",
    "Fix the failing test in the owner dashboard component",
    "Add a reviewers field to the settings form",
    "Rename the owner variable to account",
    "Update the README, the project was inherited from another team",
    "How do I undo my last git commit?",
  ]) assert.equal(fires(p), false, p);
});

test("HF-2: questions about who owns or wrote the code still fire the hint", SKIP_ON_WINDOWS_SHIM, () => {
  for (const p of [
    "Who are the owners of this repo?",
    "Who should review changes to src/app.js?",
    "Who wrote most of this codebase?",
    "What is the bus factor?",
    "Suggest reviewers for this change",
    "Who owns the payments directory?",
  ]) assert.equal(fires(p), true, p);
});
