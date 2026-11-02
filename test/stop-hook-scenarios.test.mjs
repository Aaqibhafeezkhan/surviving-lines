// @ts-check
// Trust pass 2026-11-02, item 6: scenarios the first Stop hook round skipped. Does the hook block a correct answer?
// Does a pasted table pass? Each test replays a recorded transcript (the real CLI output of the fixture as a tool
// result) through the hook; no model is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitAsIdentity, createRepo, hookEnv, lines, removeRepo } from "../scripts/fixtures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "surviving-lines-check.mjs");
const CLI = join(ROOT, "bin", "surviving-lines.js");
const D = (/** @type {string} */ d) => `2026-10-${d}T10:00:00Z`;
const PROMPT = "who owns the parser module in this repo?";

/** @param {[string, string][]} people one commit each, 40/31/16 lines @param {number[]} sizes */
function repoOf(people, sizes) {
  const dir = createRepo("sl-stopsc-");
  people.forEach(([n, m], i) => commitAsIdentity(dir, [n, m], D(String(i + 1).padStart(2, "0")), `c${i}`, { [`f${i}.txt`]: lines(`f${i}`, sizes[i]) }));
  return dir;
}
const plainFixture = () => repoOf([["Ann Lee", "ann@x.example"], ["Bob Ray", "bob@y.example"], ["Bob Ray", "bob.ray@z.example"]], [40, 31, 16]);

/** The transcript of a turn in which the agent ran the CLI with these arguments and got its real output back. @param {string} dir @param {string[]} cliArgs */
function recordedTurn(dir, cliArgs) {
  const out = spawnSync(process.execPath, [CLI, "--cwd", dir, "-q", ...cliArgs], { encoding: "utf8" }).stdout;
  return [
    { type: "user", message: { role: "user", content: PROMPT } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: `npx surviving-lines ${cliArgs.join(" ")}` } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: out }] } },
  ];
}

/** @param {string} dir @param {unknown[]} entries @param {string} answer */
function hook(dir, entries, answer) {
  const p = join(dir, "..", `trs-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(p, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const payload = { session_id: "t", transcript_path: p, cwd: dir, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: answer };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8", cwd: tmpdir(), env: hookEnv(ROOT, {}) });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

/** @param {() => string} dirOf @param {(dir: string) => void} fn */
function withDir(dirOf, fn) {
  const dir = dirOf();
  try {
    fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("HS-1: a Markdown table pasted from the tool passes", () => {
  withDir(plainFixture, (dir) => {
    const md = spawnSync(process.execPath, [CLI, "--cwd", dir, "-q", "--markdown"], { encoding: "utf8" }).stdout;
    assert.equal(hook(dir, recordedTurn(dir, ["--markdown"]), `Here is the table:\n\n${md}`), "");
    // The same table pasted by an agent that never ran the markdown command in this turn (it ran the plain one).
    assert.equal(hook(dir, recordedTurn(dir, []), `Here is the table:\n\n${md}`), "");
  });
});

test("HS-2: the plain table pasted in a code block passes", () => {
  withDir(plainFixture, (dir) => {
    const table = spawnSync(process.execPath, [CLI, "--cwd", dir, "-q"], { encoding: "utf8" }).stdout;
    assert.equal(hook(dir, recordedTurn(dir, []), `\`\`\`\n${table}\n\`\`\`\nAnn Lee leads.`), "");
  });
});

test("HS-3: a table that lists the figures the tool printed, one row per person with bold and pipes, passes", () => {
  withDir(plainFixture, (dir) => {
    const answer = "| Person | Lines | Share |\n| --- | ---: | ---: |\n| **Ann Lee** | 40 lines | **46.0%** |\n| Bob Ray | 31 lines | 35.6% |\n| Bob Ray (second address) | 16 lines | 18.4% |";
    assert.equal(hook(dir, recordedTurn(dir, []), answer), "");
  });
});

test("HS-4: both addresses of one person, added up and hedged, pass; the same sum stated as fact is blocked", () => {
  withDir(plainFixture, (dir) => {
    assert.equal(hook(dir, recordedTurn(dir, []), "Bob Ray holds 31 lines and 16 lines on two addresses; counted together that is 47 lines (54.0%), but whether they are one person is only a guess."), "");
    assert.equal(hook(dir, recordedTurn(dir, ["--merge-identities"]), "Bob Ray holds 47 lines (54.0%), his two addresses merged."), "", "the agent ran --merge-identities itself");
  });
});

test("HS-5: a decimal comma is one number, not a thousands group and a stray digit (46,0% is 46.0%)", async () => {
  const { numberFindings, extractClaims } = await import(new URL("../hooks/surviving-lines-check.mjs", import.meta.url).href);
  // A report with no zero or one-digit share anywhere, so a misread "0%" or "5%" cannot be backed by accident.
  const report = [{ authors: [{ author: "Ann Lee", lines: 4000, lineShare: 0.46, commits: 300, commitShare: 0.57 }] }];
  assert.deepEqual(numberFindings("Ann Lee holds 46,0% of the lines.", report), []);
  assert.deepEqual(extractClaims("Ann Lee holds 46,0% of the lines.").map((c) => [c.value, c.unit]), [[46, "%"]]);
  assert.equal(numberFindings("Ann Lee holds 52,5% of the lines.", report).length, 1, "a wrong decimal-comma figure is still blocked");
  assert.deepEqual(numberFindings("Ann Lee has 1.234,50 lines of ballast in a file.", report), [], "a European decimal count is not a line claim");
  assert.deepEqual(numberFindings("Ann Lee satırların %46,0 kadarına sahip.", report), [], "a prefix percent sign is not read");
  assert.deepEqual(numberFindings("Ann Lee holds 4,000 lines.", report), [], "a thousands comma still works");
});

test("HS-6: a name with accents and a non-Latin name are matched whole, and the correct figure passes", () => {
  const dir = repoOf([["José García", "jose@x.example"], ["李雷", "lilei@y.example"], ["Ann Lee", "ann@z.example"]], [40, 31, 16]);
  try {
    assert.equal(hook(dir, recordedTurn(dir, []), "José García holds 40 lines (46.0%).\n李雷 holds 31 lines (35.6%)."), "");
    assert.notEqual(hook(dir, recordedTurn(dir, []), "José García holds 31 lines."), "", "a figure that belongs to someone else is still blocked");
  } finally {
    removeRepo(dir);
  }
});

test("HS-7: a sampled run's table pasted from the transcript passes even though the hook's own report is a full run", () => {
  withDir(plainFixture, (dir) => {
    const sampled = recordedTurn(dir, ["--markdown", "--sample", "2", "--seed", "t"]);
    const md = /** @type {any} */ (sampled[2]).message.content[0].content;
    assert.equal(hook(dir, sampled, `A sample of the files:\n\n${md}`), "");
  });
});

test("HS-8: a line with two people and one number is not judged; a derived figure is not judged", () => {
  withDir(plainFixture, (dir) => {
    assert.equal(hook(dir, recordedTurn(dir, []), "Ann Lee and Bob Ray together hold 61% of the 87 lines."), "");
    assert.equal(hook(dir, recordedTurn(dir, []), "Ann Lee has roughly 50% of the lines."), "");
  });
});

test("HS-9: a wrong figure inside a pasted table is still blocked (the checks can fail)", () => {
  withDir(plainFixture, (dir) => {
    assert.notEqual(hook(dir, recordedTurn(dir, []), "| Ann Lee | 40 lines | 52.0% |"), "");
  });
});
