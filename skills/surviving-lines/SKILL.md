---
name: surviving-lines
description: Use when asked "who owns this code", "who wrote this", "who wrote the code that is still here", "bus factor", "git blame per author", "git-fame alternative", "commit counts are misleading", or when one person shows up as two authors (duplicate authors, two emails, .mailmap). Runs npx surviving-lines on a git repo.
---

# surviving-lines

Counts the lines each author still has at a git ref, using `git blame -w -M`, and prints them next to each author's share of commits. Commit counts show who was busy. Surviving lines show whose code is still there.

Requirements: Node 22 or newer, git 2.15 or newer. No other dependencies.

## When to use it

- Someone asks who wrote, owns or maintains the code in a repository, or who knows it best.
- Someone asks about bus factor, or says commit counts are misleading.
- You want a git-fame style table, or git blame totals per author.
- An author appears twice (two emails, a laptop address): use `--identities`.

Do not estimate this by hand, by `git shortlog`, or by sampling a few files. Run the tool.

## Run this first

From the repository root:

```
npx surviving-lines
```

Then, depending on the question:

- `npx surviving-lines --sort gap` puts first the authors whose line share and commit share differ most (code that stayed against work that was replaced).
- `npx surviving-lines --identities` lists addresses that look like one person and prints `.mailmap` lines. Run it before reporting numbers if any name appears twice, then apply the suggested `.mailmap` lines only if the user agrees, and run the main command again.
- `npx surviving-lines --group-by dir` gives one block per top-level directory (`dir:2` for two levels, `ext` for file type).
- `npx surviving-lines --since 2025-01-01 --until 2025-12-31` limits the commit share to a window. The line share is always for the ref.
- `--json`, `--csv` or `--markdown` change the output format. `--top <k>` changes the row count. `--include <glob>` and `--exclude <glob>` scope the files. `--co-authors share` splits credit with `Co-authored-by` trailers. `--ai-breakdown` counts assistant trailers.
- For a large repository, add `--sample 5` (one file in five, deterministic) and say that it is a sample.

Bots are left out of both columns by default. The second line of the output says how much was removed. `--include-bots` counts them.

## Shallow clones

A shallow clone (`git clone --depth`, most CI checkouts) is refused with exit code 1, because blame gives every line older than the cut to the commit at the cut. Run `git fetch --unshallow` first. `--allow-shallow` runs anyway, and the output is marked "shallow clone" and is wrong. Do not use it for an answer.

## How to read the output

- `lines` and its share: lines alive at the ref whose last change belongs to that author. Whitespace-only changes and moves inside a file do not take authorship. A `.git-blame-ignore-revs` file at the repository root is honoured.
- `commits` and its share: non-merge commits reachable from the ref.
- A large gap between the two shares is a prompt to look, not a finding by itself.
- The header says how many files were sampled and how many lines were attributed. Report that with the numbers.

## What the numbers cannot show

The tool prints this under every table. Pass it on:

- Nothing about the quality of the lines or whether they should exist.
- Review, design documents, pairing and mentoring leave no lines behind.
- Code deleted on purpose counts for nobody.
- Generated files and vendored code inflate whoever committed them. Exclude them with `--exclude`.
- It does not weight by contention: a high share in a file nobody else touches is not the same as a high share in a file everybody touches.

Use it to answer "whose code is still here?", never "who is the best engineer?". It counts AI-assistant trailers but does not detect AI-written code.
