# Proposals, AI, and MCP

> **AI may propose; the compiler decides.**

## Proposals

Four things can propose changes to a book, and none can bypass a check:

- **Analyzers.** `bun run check:suggestions [book]` lists overlapping mechanisms, recurring terms that are not registered (each with its count, files, and an example sentence), examples that restate a mechanism, and missing prerequisite edges. `bun run bookkit propose [book]` turns them into a proposal bundle: a frame reading, mechanism drafts, prerequisite edges, starter actions, and a `book.config.ts` draft. Both are deterministic (no model, no network) and write nothing until you ask.
- **Agents**, through the [MCP endpoint](#mcp): `bookkit.check_content` compiles a candidate file without writing it, and the same checks decide.
- **Judges**, an LLM or a person asked blind whether two mechanisms are one idea; see [Several books](./corpus.md).
- **Writers**, models that each draft a stub chapter from one brief, with judges choosing between the drafts; see [Drafts](#drafts). A writer can also draft a mechanism's empty definition; see [Definitions](#definitions).
- **Reviewers**, models that read a chapter you wrote against the same rules and say what they would change; see [Reviews](#reviews).

```sh
bun run bookkit propose my-book                       # review the bundle
bun run bookkit propose my-book --write               # also save it to apps/my-book/proposals/
bun run bookkit propose my-book --apply mechanisms --apply edges   # or --apply all
```

`--apply` writes drafts into the content tree: `mechanisms/`, `toolkit/`, and chapters' `prerequisites:`. A mechanism draft has its name, `status: draft`, and the evidence, and leaves the definition, `is`, and `isNot` to you; a starter action is `<mechanism>--starter-tool`. It never overwrites a registered record, keeps the reading graph acyclic (an edge that would close a loop is skipped and named), and writes a config draft to `proposals/book.config.draft.ts`, never to the live `book.config.ts`. `--id <proposal>` keeps one proposal, and `--detect-frame` reports what the text implies even when the book declares a frame.

## Drafts

`bun run bookkit draft` turns a stub (a chapter under `site.minIndexableWords`) into candidate chapters and names the one to use. It spends two kinds of model differently. Writers produce text, most of which is thrown away, so they can be small, local, and fast. Judges read every draft and write none, so they should be the models whose judgment you trust.

```sh
export BOOKKIT_DRAFT_COMMAND="ollama run <model> --think=false"   # writers: any program that reads a prompt on stdin and prints its reply
export BOOKKIT_JUDGE_COMMAND="claude -p"                          # judges: the same variable bookkit judge uses
bun run bookkit draft my-book <chapter>     # three candidates, checked, then three blind judges
bun run bookkit draft my-book --stubs       # the same for every stub, in reading order
bun run bookkit draft apply                 # write the winner into the chapter
bun run bookkit draft results               # each writer's and each judge's record so far
```

A request runs in three steps and writes only to its folder under `.bookkit/drafting/`, which git ignores:

1. **Writers.** Each gets the same brief (`brief.md`): the stub, the book's claim and reader, its chapters in order, the full contract of each mechanism the stub binds, the other mechanisms by slug, a drafted chapter of the book for length and voice, and any notes you pass with `--notes <file or folder>`. Candidate *n* comes from the *n*th command in turn (`--writer` more than once, or one per line in the variable), so candidates can come from several models. Writers are asked one at a time, each command's candidates together, because local models share one server; `--parallel <n>` asks more at once, and `--timeout <seconds>` (default 300) stops a writer that does not finish.
2. **The compiler.** Each reply becomes a candidate under the stub's frontmatter: a draft can change the body, `mechanisms:`, and `summary:`, and nothing else, so it cannot rename, reorder, or publish a chapter. Each candidate is then checked as the chapter it would replace, with the checks `bookkit check <file>` runs. A candidate with an error is out. So is one that is still a stub, or that binds a mechanism the book does not define.
3. **Judges.** Each gets the brief and the surviving drafts under neutral ids, in an order of its own, and never the command that wrote each. It ranks them and rejects any that argue past the stub's claim, rename or redefine a mechanism, coin a concept, or state a fact the brief does not supply. The call comes from a table over the ballots. A draft most judges reject is out. Of the rest, the draft most judges rank above each other one wins. When no draft does, the judges split and the choice is yours (`draft apply --pick <candidate>`). When every draft is out, there is no winner.

`draft apply` is the only step that changes the book. It refuses when the chapter has changed since the brief was written or the candidate no longer passes the check, and `--pick` overrides the judges. `--apply` on the request applies a winner as soon as there is one. The applied chapter is a draft under your name: read it before you commit it.

Without commands, the request folder holds the brief and the judges' prompts: save a writer's reply as `candidate-<n>.mdx` or a judge's as `ballot-<n>.json`, then run `bookkit draft resume`. `resume` also asks whoever failed, and a new candidate voids the ballots cast before it. `--words <n>` sets the length to aim for (default: the median of the book's drafted chapters), and `--redraft` drafts a chapter that is past the stub threshold. The framing chapter (`00-overview.mdx`) is not drafted: its headings are the frame's steps, a rule about the whole book.

A model that thinks before it answers can spend a writer's whole time limit thinking; turn thinking off in the writer command where the tool allows it (`ollama run <model> --think=false`).

### Revisions

A judge's ballot also names what the author would still change in its first choice (`fixes`). `bookkit draft revise [folder]` hands those notes, from the judges who chose the winner, to the writers with the winner itself, and asks for the whole chapter again with each change made. Candidate 1 of the revision is the winner as it was, so the judges pick a revision only when it beats the draft it revises. `--candidates <n>` sets how many revisions (default 2). It works before or after `draft apply`, and refuses once you have edited the chapter: your edits are not the judges' draft. A ballot from before judges were asked for fixes gives its reason (`why`) instead.

```sh
bun run bookkit draft revise                  # the newest request with a winner
bun run bookkit draft revise <folder> --apply
```

## Reviews

`bookkit review [book] <chapter>` is for a chapter with nothing to rank it against: one you wrote, or a draft you have edited. Each reviewer (`--judge`, or `BOOKKIT_JUDGE_COMMAND`; `--judges <n>`, default 1) gets the chapter, the contracts of the mechanisms it binds, the book's other mechanisms, and the draft rules, with the first rewritten for a chapter that no longer has a stub's plan. It answers with findings, each naming the rule it breaks (0 for a mechanism's contract), where, and the change that would fix it. A review is advice: it never edits the chapter, and `bookkit check` decides whether the chapter passes. The prompt, each reply, and `review.json` are under `.bookkit/reviewing/`.

## Finishing

`bookkit finish [book] [chapter]` joins the three: it reviews a drafted chapter, hands the findings, the check's warnings, and any label `check:concepts` finds in it to the writers as a revision, and has blind judges choose between the revisions and the chapter as it stood. Then it reviews the winner and goes again. It stops when a review finds nothing, when no revision beats the chapter, when the findings stop falling, or after `--rounds` (default 3), and prints each chapter's findings by round (`11 → 6 → 2`). The judges and the reviewer do not always agree, so a round can leave a chapter worse by the reviewer's count; when it stops, `finish` keeps the version with the fewest findings and warnings, the latest of a tie. A writer or judge that fails is asked once more.

```sh
bun run bookkit finish running-hot --writer "ollama run <model> --think=false" --judge "claude -p"
```

It works only on a chapter that still holds a draft word for word, as `draft apply` wrote it, so an edit of yours is never rewritten; `--include-edited` lets it revise those too. With no chapter named, it takes every such chapter of the book. The judge commands also review (`--reviewers`, default 1). Each round is a review under `.bookkit/reviewing/` and a request under `.bookkit/drafting/`, so `draft results` counts its writers and judges. The result is still a draft under your name.

## Definitions

`bun run bookkit propose --apply mechanisms` and `bookkit new mechanism` without `--definition` write a mechanism with a name and empty fields. `bookkit define [book] <mechanism>` asks a writer (`--writer`, or `BOOKKIT_DRAFT_COMMAND`) to fill them from the sentences of the book that use the mechanism, with the book's other mechanisms as the boundary. It shows the proposal; `--apply` writes that proposal into the empty fields, and never over a field you wrote. A proposal is not written when the content check finds an error, or when its definition scores 0.5 or more by wording against a mechanism in any book: merge the two (`bookkit merge`), or write the boundary yourself and ask judges (`bookkit judge`). The prompt, reply, and proposal are under `.bookkit/defining/`.

## Model downloads

Comparing mechanisms by meaning uses `nomic-ai/nomic-embed-text-v1.5`, about 550 MB, through the optional `@xenova/transformers` dependency. It is downloaded once, and only with consent:

- at a terminal, `bookkit check`, `bookkit similar --semantic`, and `check:corpus` ask first;
- elsewhere, `--download-model` or `BOOKKIT_DOWNLOAD_MODEL=1` allows it; without either, wording alone is compared and the output says so;
- the MCP tools compare meaning only when the model is cached or `BOOKKIT_DOWNLOAD_MODEL=1` is set in the MCP server's environment.

The cache is inside `node_modules`, so a reinstall deletes it; set `BOOKKIT_MODEL_CACHE` to keep it elsewhere. `--quick` (`bookkit check`) and `--no-semantic` (`check:corpus`) skip the model.

## MCP

Bookkit serves its content and checks to AI agents over the Model Context Protocol, in two ways:

- **stdio, in a workspace:** `bun run mcp` (`-- --book <slug>` picks the book the content tools read; the default is the current book, set with `bookkit use`, else the first folder under `apps/`). `.mcp.json` registers it as `bookkit`, so Claude Code offers it in this repository, or in a project made with create-bookkit, with no server running.
- **HTTP, from a book:** `bookkit dev` answers `POST /api/mcp.json`. A static build serves only the `GET` manifest, whose `toolCalls.served` says whether the address answers tool calls; on a server deployment, `tools/call` needs the author token, and `resources/*` and `tools/list` do not.

The tools, each prefixed `bookkit.`: `list_books`, `read_book`, `list_content`, `list_mechanisms`, `list_skills`, `get_content_contract`, `check_content`, `write_content`, `validate_book`, `compile_book`, `export_book`, `check_separation`, `check_corpus`, `find_similar_mechanisms`, and `create_book` (`book`, `title`, and `frame`), `status` (every book's counts, and for one book which chapters bind which mechanisms), and `bets` (the active bet and how it measures). Every content tool takes `book` for another book in the workspace, and a misspelled book or argument is an error that names the right ones. `read_book` returns an index (section, slug, title) unless given `slug` or `full: true`. `get_content_contract` returns each section's fields, its JSON Schema, and a template that compiles; `check_content` compiles one candidate file without writing it, with the checks `bookkit check <file>` runs (references, prerequisites and links, the frame, and the MDX compiler); `write_content` checks it the same way and, when it passes, writes it where the book reads it (an existing file is replaced only with `overwrite: true`). `validate_book`, `compile_book`, and `check_content` apply the book's status rule; `releaseMode: true` on `validate_book` or `check_content` forces release rules on a draft, and `check_content` reports `bookStatus` and `releaseRules`. Results carry a `text` item with the JSON and the same object as `structuredContent`. Without MCP, `bun run bookkit contract` and `bun run bookkit check <file> --json` give the same answers.

### Prompts

The server also offers three prompts (`prompts/list`, `prompts/get`), which a client shows its user as ready-made requests. Each carries the entry it names, so it works without tool calls:

- `bookkit.apply_mechanism` (`mechanism`, `situation`): runs the mechanism's tests on the reader's situation, checks what it is not, and only then says whether it applies.
- `bookkit.run_tool` (`tool`, `situation` optional): walks through one tool a step at a time, waiting for each, and stops where failure looks like the tool says.
- `bookkit.draft_chapter` (`chapter`): drafts with the contract and `check_content`, and calls `write_content` only when the author says to.

An entry is named by its slug or its file name.

## For language models on the web

A built book serves `/llms.txt`, an index in the [llmstxt.org](https://llmstxt.org) form, and a Markdown copy of each chapter, mechanism, tool, glossary entry, and example (`/md/mechanisms/<slug>.md`, and so on for each section). A copy is the entry's source with its frontmatter, where a mechanism's definition, `is`, `isNot`, and tests are, and without MDX comments. They follow the site's rule for crawlers: a book that is not indexable (a draft, or `site.indexable: false`) lists nothing, and a stub chapter has no copy, as it has no place in search.

