# Several books: one meaning per mechanism

When one author keeps several books in a workspace, `bun run check:corpus` holds each mechanism to one meaning across them. `corpus.json` at the workspace root names the books that share a vocabulary; a book outside that list is compared only with itself. A lexical pass compares wording, a semantic pass compares meaning (cutoff 0.79 for the default model; `--threshold`), and judges' verdicts in `corpus-judgments.json` flag pairs that word the same idea differently. Close pairs are grouped into clusters, each one a decision for the author: one mechanism, or two with sharper boundaries.

```sh
export BOOKKIT_JUDGE_COMMAND="claude -p"      # any program that reads a prompt on stdin and prints its reply
bun run bookkit judge <mechanism>             # three blind judges on its nearest pairs; records their calls
bun run bookkit rule <a> <b> --distinct "<what each one's lever is>"
bun run bookkit merge <keep> <drop> --reason "<the lever and evidence they share>" --dry-run
bun run bookkit sync <mechanism>              # copy the copy edited last to the mechanism's other books
bun run bookkit sync <mechanism> --to <book>  # share it with a book that has no copy yet
bun run bookkit rename mechanism <slug> <new-slug> --title "<title>"
```

- **`judge [mechanism]`** writes one blind prompt per judge under `.bookkit/judging/` and, with a judge command (`--run "<command>"` or `BOOKKIT_JUDGE_COMMAND`), asks each judge in an empty folder of its own and records the answers, each vote with the command that gave it. Several commands (`--run` more than once, or one per line in the variable) ask the judges in turn, so a panel can mix models and `--eval` can score each one. `judge --rulings` asks about your ruled pairs, which is what `--eval` scores, so a new panel or model is measured against your rulings. Leading `NAME=value` assignments are dropped from the recorded command; anything else in it is committed with the votes, so pass keys through the environment. Without one, paste each prompt into a fresh session, save the replies as `answer-<n>.json` in the request folder, and run `bookkit judge record`. A verdict stops applying when either mechanism's text changes.
- **`rule <a> <b> --distinct "<reason>"`** records in `corpus.json` that two mechanisms are different ideas.
- **`merge <keep> <drop> --reason "<why>"`** records that they are one: in every book of the corpus, `<drop>` becomes `<keep>` with one contract, its glossary entry and examples move, and references are rebound. It removes `/read/mechanisms/<drop>`; note that in a published book's release notes.
- **`sync <mechanism>`** copies a shared mechanism's contract to its other books, so the copies do not drift. `--to <book>` shares it with a book that has no copy, which `new mechanism` suggests when the slug exists elsewhere.
- **`rename mechanism [book] <slug> <new-slug> [--title "…"]`** changes a mechanism's slug in every book of its corpus, with everything that names it (chapters, actions, examples and their folder, the glossary entry, links, config), and records the old slug in `corpus.json`, so a stale reference names the new one. Slugs are durable identifiers: it removes `/read/mechanisms/<slug>`, which a published book's release notes should say.

`check:corpus --book <slug>` reports only the pairs that involve one book. `--mode error` exits 1 while a cluster, drift, or stale ruling remains; `--json` and `--export <file>` print machine output, and `--eval` scores the models and the judges against the author's recorded rulings.
