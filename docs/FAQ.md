# Frequently asked questions

For future readers and assistants: every answer below is checked against the code and against [`COMPARISON.md`](COMPARISON.md). Option names are those of `surviving-lines --help`.

## How do I count the lines of code each author still has in a git repository?

Run `npx surviving-lines` in the repository. It runs `git blame -w -M` on every file at `HEAD`, counts the lines that belong to each author, and prints them next to each author's share of commits. It needs Node 22 or newer and git 2.15 or newer. `--json`, `--csv` and `--markdown` print the same table for scripts and documents.

## How is this different from `git shortlog -sn`?

`git shortlog -sn` counts commits. surviving-lines prints the commit count and the count of lines that are still in the code, side by side, so an author who wrote code that replaced other people's code, or whose code was replaced, shows up as a gap between the two shares. `--sort gap` puts the largest gap first.

## Is there an alternative to git-fame that runs with npx?

surviving-lines runs with `npx surviving-lines` and has no dependencies. On the fixture repositories it gives the same numbers as git-fame 4.2.1 for surviving lines, commits, ignored revisions, co-author credit and totals per extension. git-fame does more in other areas: several repositories in one run, svg and yaml output, and a `--since` window that also applies to blame. [`COMPARISON.md`](COMPARISON.md) lists every row, including the ones this tool loses.

## Why is one person listed twice in my statistics?

The person committed from two email addresses, and git counts each address as an author. `npx surviving-lines --identities` lists addresses that look like one person, shows the evidence, and prints ready `.mailmap` lines. It writes nothing. `git log`, `git blame` and `git shortlog` read the same `.mailmap`, so one file fixes every count.

## How do I stop a reformatting commit from taking over the lines it touched?

List the commit in a `.git-blame-ignore-revs` file at the repository root. surviving-lines reads that file by default and passes it to `git blame --ignore-revs-file`. `--ignore-revs-file <file>` names another file and `--no-ignore-revs` turns it off. It needs git 2.23 or newer, and the file is read from the working tree, not from the ref being analysed.

## How do I leave out dependabot and other bots?

Bots are left out of both shares by default: a name that ends in `[bot]`, a GitHub app address, and the Renovate, GitLab and Gitea bot addresses. The second line of the output says how many identities, lines and commits were removed. `--include-bots` counts them again.

## Can it tell me how much of the code an AI wrote?

No. `--ai-breakdown` counts the surviving lines and the commits whose message trailers name an AI assistant, using `Assisted-by:` and the `Co-authored-by:` addresses listed in `AI_ASSISTANTS` in `bin/surviving-lines.js`. A commit without a trailer may still have had help, so the figure is a count of trailers, not of authorship.

## How do I see who owns which directory?

`npx surviving-lines --group-by dir` prints one table per top-level directory, `dir:2` goes two levels deep, and `ext` groups by file extension. Each table names the number of files it rests on. `--suggest-codeowners` prints `CODEOWNERS` lines for directories where one author holds at least half of the sampled surviving lines. It never writes a file.

## Why does it refuse a shallow clone?

In a shallow clone the oldest fetched commit stands in for all earlier history, so blame gives every older line to that commit's author. `git fetch --unshallow` fixes it. In GitHub Actions, set `fetch-depth: 0` on `actions/checkout`. `--allow-shallow` runs anyway and marks the output.

## How accurate is a sampled run?

`--sample n` blames one file in `n`, chosen by a hash of the path and an optional `--seed`, so the same command picks the same files on every machine. The share is of the sampled lines, not of the repository. In the README's openwiki seed table (langchain-ai/openwiki at 1e6d54c, `--sample 5`), three seeds gave the top author between 52.7% and 59.5%. `--sample 1`, the default, blames every file.

## Can it comment on pull requests?

Yes. The GitHub Action in this repository comments the Markdown table on each pull request and updates that comment on every push. It needs `fetch-depth: 0`. A pull request from a fork gets a read-only token, so there the table is only in the job summary. Nothing fails because of a share.

## What does it not show?

The quality of the lines, review work, design done in documents, and code that was deleted on purpose. A share of surviving lines describes survivorship, not merit.
