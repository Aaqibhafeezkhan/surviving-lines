// Deterministic fixture repositories, shared by the tests and by the comparison harness
// (scripts/compare). Every commit has a fixed author, date and message, so a fixture built twice
// has the same commit ids. Node built-ins only.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** name and address per person. The bot rows use the identities GitHub gives its apps. */
export const PEOPLE = {
  ada: ["Ada", "ada@example.com"],
  bob: ["Bob", "bob@example.com"],
  charlie: ["Charlie", "charlie@example.com"],
  dependabot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
  renovate: ["renovate[bot]", "29139614+renovate[bot]@users.noreply.github.com"],
  // Names and addresses that merely look like a bot's. They are people and must be counted.
  botHawkins: ["Bot Hawkins", "bot.hawkins@example.com"],
  botticelli: ["Botticelli", "botticelli@example.com"],
  // The same name on a second address, which --identities should link to ada.
  adaLaptop: ["Ada", "ada@laptop.example.org"],
};

/** @param {string} prefix @param {number} n @returns {string} n lines, each ending in a newline */
export const lines = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix} ${i}`).join("\n") + "\n";

/** @param {string} dir @param {string[]} args @param {Record<string, string>} [env] */
export function git(dir, args, env = {}) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

/** @param {string} prefix a name for the temporary directory @returns {string} the new repository */
export function createRepo(prefix = "sl-fixture-") {
  // The real path, not the symlinked one: on macOS $TMPDIR is under /var, a symlink to /private/var, and
  // git-who prints an empty tree for a repository reached through it.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "core.autocrlf", "false"]);
  return dir;
}

/**
 * Write files, then commit them as one person on one date.
 * @param {string} dir
 * @param {keyof typeof PEOPLE} who
 * @param {string} date an ISO timestamp
 * @param {string} message the whole commit message, trailers included
 * @param {Record<string, string | Buffer | null>} files path to content; null removes the file
 * @returns {string} the new commit id
 */
export function commitAs(dir, who, date, message, files) {
  const [name, email] = PEOPLE[who];
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const removed = [];
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      removed.push(path);
    } else {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
      added.push(path);
    }
  }
  if (added.length) git(dir, ["add", "--", ...added]);
  if (removed.length) git(dir, ["rm", "-q", "--", ...removed]);
  const env = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: "CI", GIT_COMMITTER_EMAIL: "ci@example.com", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  git(dir, ["commit", "-q", "--allow-empty", "-m", message], env);
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

/** @param {string} dir */
export const removeRepo = (dir) => rmSync(dir, { recursive: true, force: true });

const D = (m, d) => `2026-${m}-${d}T10:00:00Z`;

/** Ada 11 and Bob 10 surviving lines; Ada 1 commit and Bob 2; a binary file that is skipped. */
function basic() {
  const dir = createRepo("sl-basic-");
  commitAs(dir, "ada", D("01", "10"), "ada: initial", { "src/a.js": lines("line", 10), "src/b.js": lines("b", 5), "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) });
  commitAs(dir, "bob", D("03", "10"), "bob: rewrite tail, add c", { "src/a.js": ["line 0", "line 1", "line 2", "line 3", "line 4", "line 5", "bob 6", "bob 7", "bob 8", "bob 9"].join("\n") + "\n", "src/c.js": lines("c", 6) });
  git(dir, ["mv", "src/b.js", "src/renamed.js"]);
  commitAs(dir, "bob", D("03", "11"), "bob: rename b", {});
  return dir;
}

/**
 * Ada writes src/app.js (20 lines), Bob reformats every one of them, Ada adds 10 lines elsewhere,
 * then Ada records Bob's reformat commit in .git-blame-ignore-revs (2 lines: a comment and the id).
 * Without the file Bob holds src/app.js; with it Ada does.
 */
function reformat() {
  const dir = createRepo("sl-reformat-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", { "src/app.js": lines("line", 20) });
  const formatId = commitAs(dir, "bob", D("02", "01"), "bob: run the formatter", { "src/app.js": Array.from({ length: 20 }, (_, i) => `line ${i};`).join("\n") + "\n" });
  commitAs(dir, "ada", D("03", "01"), "ada: extra", { "src/extra.js": lines("extra", 10) });
  commitAs(dir, "ada", D("03", "02"), "ada: ignore the formatter commit", { ".git-blame-ignore-revs": `# formatter\n${formatId}\n` });
  return dir;
}

/** Ada 11, Bob 6, Botticelli 4 and Bot Hawkins 2 lines are people; dependabot holds 17 and renovate 3. */
function bots() {
  const dir = createRepo("sl-bots-");
  commitAs(dir, "ada", D("01", "10"), "ada: a", { "src/a.js": lines("a", 10) });
  commitAs(dir, "bob", D("01", "11"), "bob: b", { "src/b.js": lines("b", 6) });
  commitAs(dir, "botticelli", D("01", "12"), "botticelli: t", { "src/t.js": lines("t", 4) });
  commitAs(dir, "botHawkins", D("01", "13"), "bot hawkins: h", { "src/h.js": lines("h", 2) });
  commitAs(dir, "dependabot", D("02", "01"), "chore(deps): bump one", { "docs/deps.txt": lines("dep", 12) });
  commitAs(dir, "dependabot", D("02", "02"), "chore(deps): bump two", { "docs/deps2.txt": lines("dep2", 5) });
  commitAs(dir, "renovate", D("02", "03"), "chore(deps): renovate", { "docs/ren.txt": lines("ren", 3) });
  commitAs(dir, "ada", D("02", "04"), "ada: more", { "src/a2.js": lines("a2", 1) });
  return dir;
}

/**
 * Trailers. Bob pairs with Ada (10 lines), with Claude (8 lines) and with Ada's old address (6
 * lines, which .mailmap folds into Ada); one commit carries an Assisted-by trailer with no
 * address (4 lines); one commit mentions Co-authored-by in prose, which is not a trailer (3 lines).
 */
function trailerRepo(withAssisted) {
  const dir = createRepo(withAssisted ? "sl-coauthor-" : "sl-pairing-");
  commitAs(dir, "ada", D("01", "10"), "ada: solo", { "src/solo.js": lines("solo", 10), ".mailmap": "Ada <ada@example.com> <ada@old.example.com>\n" });
  commitAs(dir, "bob", D("01", "11"), "bob: pair\n\nCo-authored-by: Ada <ada@example.com>", { "src/pair.js": lines("pair", 10) });
  commitAs(dir, "bob", D("01", "12"), "bob: with claude\n\nCo-Authored-By: Claude <noreply@anthropic.com>", { "src/claude.js": lines("claude", 8) });
  commitAs(dir, "bob", D("01", "13"), "bob: old address\n\nCo-authored-by: Ada Lovelace <ada@old.example.com>", { "src/old.js": lines("old", 6) });
  if (withAssisted) commitAs(dir, "bob", D("01", "14"), "bob: assisted\n\nAssisted-by: AGENT:model-1", { "src/assisted.js": lines("assisted", 4) });
  commitAs(dir, "bob", D("01", "15"), "bob: prose\n\nCo-authored-by: Mallory <mallory@example.com> is only mentioned in this paragraph.\nIt is not a trailer.\n\nSigned-off-by: Bob <bob@example.com>", { "src/prose.js": lines("prose", 3) });
  return dir;
}

/** Directory layout for --group-by: root, one level, and a deep path. */
function dirs() {
  const dir = createRepo("sl-dirs-");
  commitAs(dir, "ada", D("01", "10"), "ada: files", { "src/a/x.js": lines("x", 10), "docs/guide.md": lines("g", 6), "README.md": lines("r", 3) });
  commitAs(dir, "bob", D("01", "11"), "bob: files", { "src/a/y.js": lines("y", 4), "src/b/z.js": lines("z", 10), "lib/deep/er/q.js": lines("q", 5) });
  return dir;
}

/** 120 files of 40 lines over three authors, for timing. */
function wide() {
  const dir = createRepo("sl-wide-");
  const who = /** @type {const} */ (["ada", "bob", "charlie"]);
  for (let w = 0; w < 3; w++) {
    /** @type {Record<string, string>} */
    const files = {};
    for (let i = w; i < 120; i += 3) files[`pkg${i % 10}/f${i}.js`] = lines(`f${i}`, 40);
    commitAs(dir, who[w], D("01", String(10 + w)), `${who[w]}: files`, files);
  }
  return dir;
}

const coauthor = () => trailerRepo(true);
/** The same history without the Assisted-by commit: git-fame 4.2.1 stops with a traceback on a trailer that has no address. */
const pairing = () => trailerRepo(false);

/** Ada on two addresses (12 and 8 lines) and Bob on one (10 lines): one person split in two. */
function split() {
  const dir = createRepo("sl-split-");
  commitAs(dir, "ada", D("01", "10"), "ada: desktop", { "src/a.js": lines("a", 12) });
  commitAs(dir, "adaLaptop", D("01", "11"), "ada: laptop", { "src/b.js": lines("b", 8) });
  commitAs(dir, "bob", D("01", "12"), "bob: c", { "src/c.js": lines("c", 10) });
  return dir;
}

export const FIXTURES = { split, basic, reformat, bots, coauthor, pairing, dirs, wide };

/** @param {keyof typeof FIXTURES} name @returns {string} a new repository; remove it with removeRepo */
export const buildFixture = (name) => FIXTURES[name]();
