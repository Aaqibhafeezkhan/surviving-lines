# GEO prompts

Five fixed prompts a developer might ask an assistant in this category. They are recorded before launch and again 14 days after. Do not reword them: a changed prompt breaks the comparison.

How to record: paste the prompt into each assistant in a fresh conversation with web search on, and again with it off. Copy the date, the assistant and model name as the product shows them, whether `surviving-lines` is named (yes or no), its position among the tools named, and the sentence that names it. Fill the table below and commit it with the date in the commit message.

| Id | Prompt |
| --- | --- |
| G1 | What is the best command-line tool to see which developers wrote the code that is still in a git repository, not just who made the most commits? |
| G2 | How do I count lines of code per author in a git repository with git blame, ignoring reformatting commits and bots? |
| G3 | What is an alternative to git-fame that I can run with npx? |
| G4 | How can I find out whether one contributor appears twice in my git statistics because they used two email addresses? |
| G5 | Which tool shows how much of a repository's surviving code comes from commits that name an AI assistant as co-author? |

## Records

| Date | Assistant and model | Search | Prompt | Named | Position | Sentence |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-21 | Perplexity (signed out, default model) | on | G1 | yes | 1 | surviving-lines named first and linked |
| 2026-10-21 | Perplexity (signed out, default model) | on | G2 | no |  | no tool named in the answer; github.com/Bubblegunn/surviving-lines cited as a source |
| 2026-10-21 | Perplexity (signed out, default model) | on | G3 | no |  | fame, git-fame-coefficient, git-truck |
| 2026-10-21 | Perplexity (signed out, default model) | on | G4 | no |  | no tool named in bold; answer text not read |
| 2026-10-21 | Perplexity (signed out, default model) | on | G5 | no |  | clocwork |

## Notes on the 2026-10-21 round

Recorded by Claude in Chrome before launch. Only whether the name appears, links to the project, and the other tools the answer names (found by a scan for known names) were kept; the full answer text was not saved. Perplexity (signed out) answered the first ten questions across the repositories and then showed a sign-up wall, so the rest went to ChatGPT in a temporary chat with no memory. Ask the 14-day round in the same assistant per prompt, or the comparison is not like for like.
