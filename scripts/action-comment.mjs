#!/usr/bin/env node
// Post the surviving-lines table as a pull request comment, or update the comment this action posted
// before, so a pull request that is pushed to fourteen times still has one table. Used by action.yml.
//
//   node scripts/action-comment.mjs <markdown-file>
//
// Reads GH_TOKEN, PR (pull request number) and REPO (owner/name) from the environment and talks to
// GitHub through the `gh` CLI, which every GitHub-hosted runner has.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The first line of the comment. Finding it is how a later run knows which comment is its own. */
export const MARKER = "<!-- surviving-lines-summary -->";

/**
 * The comment text: the marker, a heading, the table the tool printed, and what the table covers.
 * @param {string} markdown
 * @returns {string}
 */
export function buildBody(markdown) {
  return [
    MARKER,
    "### Surviving lines",
    "",
    markdown.trim(),
    "",
    "<sub>The whole repository at this pull request's merge commit, not only the files it changes. Updated on every push. Share of surviving lines is not a measure of merit.</sub>",
    "",
  ].join("\n");
}

/**
 * @param {string[]} args
 * @returns {string}
 */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Update the comment that starts with MARKER, or create it. Returns what it did.
 * @param {{ repo: string, pr: string, body: string }} o
 * @returns {"created" | "updated"}
 */
export function postOrUpdate({ repo, pr, body }) {
  const found = gh(["api", `repos/${repo}/issues/${pr}/comments`, "--paginate", "--jq", `.[] | select(.body | startswith("${MARKER}")) | .id`])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (found) {
    gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${found}`, "-f", `body=${body}`]);
    return "updated";
  }
  gh(["api", "-X", "POST", `repos/${repo}/issues/${pr}/comments`, "-f", `body=${body}`]);
  return "created";
}

function main() {
  const [file] = process.argv.slice(2);
  const { PR, REPO } = process.env;
  if (!file || !PR || !REPO) {
    console.error("usage: PR=<number> REPO=<owner/name> GH_TOKEN=<token> node action-comment.mjs <markdown-file>");
    process.exit(2);
  }
  try {
    console.log(`comment ${postOrUpdate({ repo: REPO, pr: PR, body: buildBody(readFileSync(file, "utf8")) })}`);
  } catch (e) {
    // A pull request from a fork gets a read-only token, so this is expected there. The table is already
    // in the job summary, so say so and do not fail the build.
    const why = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.log(`::warning title=Comment not posted::${why}. The table is in the job summary.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
