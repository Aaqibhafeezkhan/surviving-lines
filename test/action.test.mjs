// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const action = readFileSync(join(root, "action.yml"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const { MARKER, buildBody, postOrUpdate } = await import("../scripts/action-comment.mjs");

test("action.yml: inputs, the version default, and the shallow refusal", () => {
  for (const name of ["sample", "top", "args", "comment", "version", "package"]) assert.match(action, new RegExp(`^  ${name}:$`, "m"), name);
  assert.match(action, /^  sample:\n(?:    .*\n)*?    default: "5"$/m);
  // The release script rewrites this default and the release gate compares it with package.json.
  const m = /^  version:\n(?:    (?!default:).*\n)*    default: "([^"]*)"/m.exec(action);
  assert.equal(m?.[1], pkg.version);
  assert.match(action, /git rev-parse --is-shallow-repository/);
  assert.match(action, /fetch-depth: 0/);
});

test("action.yml: every third-party step is pinned to a commit and no input is pasted into a script", () => {
  for (const line of action.split("\n")) {
    const use = /^\s*-?\s*uses:\s*(\S+)/.exec(line);
    if (use && !use[1].startsWith("./")) assert.match(use[1], /@[0-9a-f]{40}$/, `unpinned: ${line}`);
    // An input may only reach a step through env: or if:, never through the script text.
    if (line.includes("${{") && !/^\s+(SL_\w+|GH_TOKEN|PR|REPO):|^\s+if:/.test(line)) assert.fail(`expression outside env: or if: -> ${line.trim()}`);
  }
  assert.doesNotMatch(action, /pull_request_target/);
});

test("buildBody starts with the marker, keeps the table, and says what it covers", () => {
  const body = buildBody("| author | lines |\n| --- | ---: |\n| Ada | 3 |\n");
  assert.equal(body.split("\n")[0], MARKER);
  assert.match(body, /\| Ada \| 3 \|/);
  assert.match(body, /whole repository/);
  assert.doesNotMatch(body, /\u2014/);
});

/** A fake `gh` on PATH that logs every call and answers the comment listing from STATE_FILE. */
function withFakeGh(/** @type {(env: Record<string, string>, calls: () => string[][]) => void} */ fn, { existing = "", fail = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sl-gh-"));
  const saved = { ...process.env };
  const log = join(dir, "calls.jsonl");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");
if (${fail}) { console.error("gh: HTTP 403: Resource not accessible by integration"); process.exit(1); }
if (process.argv.includes("--paginate")) process.stdout.write(${JSON.stringify(existing)});
`;
  writeFileSync(join(dir, "gh"), script);
  chmodSync(join(dir, "gh"), 0o755);
  try {
    fn({ PATH: `${dir}${delimiter}${process.env.PATH}`, PR: "7", REPO: "o/r", GH_TOKEN: "t" }, () => (readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))));
  } finally {
    for (const k of ["PATH", "PR", "REPO", "GH_TOKEN"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the first run creates the comment; a later run updates that same comment instead of adding another", { skip: process.platform === "win32" && "the fake gh is a shell-less script" }, () => {
  withFakeGh((env, calls) => {
    Object.assign(process.env, env);
    assert.equal(postOrUpdate({ repo: "o/r", pr: "7", body: "b" }), "created");
    const [list, post] = calls();
    assert.deepEqual(list.slice(0, 3), ["api", "repos/o/r/issues/7/comments", "--paginate"]);
    assert.ok(list.join(" ").includes(MARKER));
    assert.deepEqual(post.slice(0, 4), ["api", "-X", "POST", "repos/o/r/issues/7/comments"]);
  });
  withFakeGh((env, calls) => {
    Object.assign(process.env, env);
    assert.equal(postOrUpdate({ repo: "o/r", pr: "7", body: "b2" }), "updated");
    const patch = calls().find((c) => c.includes("PATCH"));
    assert.deepEqual(patch?.slice(0, 4), ["api", "-X", "PATCH", "repos/o/r/issues/comments/4242"]);
    assert.ok(!calls().some((c) => c.includes("POST")), "no second comment");
  }, { existing: "4242\n9999\n" });
});

test("the script posts through gh, and a refused token is a warning, not a failed build", { skip: process.platform === "win32" && "the fake gh is a shell-less script" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "sl-md-"));
  writeFileSync(join(dir, "t.md"), "| a |\n");
  try {
    withFakeGh((env, calls) => {
      const run = spawnSync(process.execPath, [join(root, "scripts", "action-comment.mjs"), join(dir, "t.md")], { encoding: "utf8", env: { ...process.env, ...env } });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^comment created$/m);
      assert.ok(calls().some((c) => c.includes("POST")));
    });
    withFakeGh((env) => {
      const run = spawnSync(process.execPath, [join(root, "scripts", "action-comment.mjs"), join(dir, "t.md")], { encoding: "utf8", env: { ...process.env, ...env } });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^::warning title=Comment not posted::.*The table is in the job summary\.$/m);
    }, { fail: true });
    const missing = spawnSync(process.execPath, [join(root, "scripts", "action-comment.mjs")], { encoding: "utf8", env: { ...process.env, PR: "", REPO: "" } });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /usage:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
