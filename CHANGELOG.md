# Changelog

Dated, documented behavior changes to the Bookkit engine, schemas, validators, and scripts.
Per-book editorial history lives in each app's `src/content/book/releases/`.
This file holds the current month, newest first. Earlier months are in `docs/changelog/`, one file each; when a month ends, its entries move there.

## 2026-11-12 — `bookkit finish`: drafts taken the last mile

The owner overrode maintenance mode for this work (AGENTS.md).

- **`bookkit finish [book] [chapter]`** loops review, revision, and a blind judgment until a reviewer has nothing left to change in a drafted chapter, no revision beats the chapter, the findings stop falling, or `--rounds` runs out. It revises only chapters that still hold a draft exactly as `draft apply` wrote it, unless `--include-edited`. Each round's notes are the review's findings, the content check's warnings, and the labels `check:concepts` finds in the chapter. When it stops, it keeps the version with the fewest of them (the latest of a tie), so a round the judges liked and the reviewer did not is undone. A writer or judge that fails is asked once more before the chapter stops.
- **Shared pieces:** `runReview` (commands/review.ts) and `startChapterRevision` (draft-run.ts) are what `review`, `draft revise`, and `finish` use; `draftHeldBy` tells a model's draft from an author's edit.
- **Migration:** none.

## 2026-11-12 — One check context, routes Astro would merge, shared model replies

The owner overrode maintenance mode for these refactors (AGENTS.md).

- **One context for checking a file.** `bookCheckContext` (and `candidateCheckContext` for a file of a workspace book) in `validators/` gives a file the book's mechanisms, route slugs, retired slugs, frame, and release rule. `validate`, MCP `check_content`, a draft's gate, and `bookkit define` used to build it four times; they now share it, so a rule that needs more context reaches all four. One change in behavior: `check_content` on a book with no mechanisms now reports a reference to an unknown mechanism, as `validate` already did, instead of skipping the check.
- **Pages that would serve one URL are an error.** Astro drops a `.md`, `.mdx`, `.astro`, `.js`, or `.ts` ending from a route's last part, so `read/chapters/[slug].md.ts` served the same URL as `read/chapters/[slug].astro` and one of them was silently dropped. `routePatternOf` now reads patterns the way Astro does, and `bookkit()` stops the build or dev server, naming both files, when two engine pages or two of a book's own pages collide. A book page that collides with an engine page still replaces it, as before.
- **Model replies are read in one place.** `jsonInReply` (in `scripts/lib/model-command.ts`) finds the JSON in a reply for judges' ballots, reviews, definitions, and corpus judgments, and `freshPath` names a new request folder. `bookkit review` no longer names a second review in the same minute `…-2-3`.
- **`bookkit help` lists `triage`, `redteam`, and `probe`**, under Diagnose, and a test fails when a command is missing from it.
- **`/llms.txt` says why it lists nothing:** the book is a draft, or its `site.indexable` is false, as it is outside a production build in most books.
- **`docs/architecture.md`** records that some MCP tools run the workspace CLI as a subprocess, a dependency the import rule cannot see, and which tests keep it whole.
- **Migration:** none, unless a book's `src/pages/` has two pages that serve one URL; rename one.

## 2026-11-12 — Revisions, reviews, definitions, and the book for models

The owner overrode maintenance mode for this work (AGENTS.md).

- **`bookkit draft revise [folder]`** has the writers make the changes the judges named in a winning draft, then judges the revisions against the winner as it was. Judges are now asked for `fixes` in each ballot: what the author would still change in their first choice. A ballot without them is read as before, with no fixes.
- **`bookkit review [book] <chapter>`** has judge models read a written chapter against the draft rules and its mechanisms' contracts, and print each finding with its fix. It writes only under `.bookkit/reviewing/`.
- **`bookkit define [book] <mechanism>`** has a writer draft a mechanism's empty definition, `is`, `isNot`, predictions, and tests from the book's sentences that use it. `--apply` writes the proposal shown into the empty fields only, and refuses one that fails the check or scores 0.5 or more by wording against another mechanism.
- **MCP:** two tools, `bookkit.status` and `bookkit.bets`, and three prompts, `bookkit.apply_mechanism`, `bookkit.run_tool`, and `bookkit.draft_chapter`. `initialize` reports `capabilities.prompts`.
- **`/llms.txt` and `/md/<section>/<slug>.md`** on every built book: an index for language models and a Markdown copy of each entry, following the site's rule for crawlers (nothing for a book that is not indexable; no stub chapters).
- **Session start** prints the maintenance notice and `bookkit bets` in every Claude Code session, not only cloud ones, which still install the workspace first.
- **Migration:** none. A request folder made before this change revises from its judges' reasons, since its ballots have no fixes. A book's own page at `src/pages/llms.txt.ts` or `src/pages/md/[...path].ts` replaces the engine's.

## 2026-11-11 — No dead links in a project made by create-bookkit

- **A new book's README links to the guide on GitHub.** Its link to "A book's own pages" was `../../docs/guide/concepts.md`, which resolves inside this repository and nowhere in a project `create-bookkit` makes, since that project holds one book and the engine but not `docs/`. The engine's own README (to `packages/create-bookkit/README.md`) and `src/README.md` (to `docs/architecture.md`) had the same problem in the copy a project vendors. All three now link to the file on GitHub, and a create-bookkit test fails on any relative Markdown link to a file the project does not have.
- **Migration:** none. A book made earlier keeps its README, which is the author's; change the link by hand if it matters.

## 2026-11-10 — Social preview no longer cropped

- **`docs/assets/social-preview.png` is redrawn at 1280×640.** The On-Call Runbook panel on its right ran off the right and bottom edges and cut its steps short. It is now a whole card, 64px from every edge, with three steps that fit.
- **It has a source.** `docs/assets/social-preview.html` is the layout and `bun docs/assets/social-preview.ts` renders it with Playwright in the books' typefaces. The render writes nothing if a typeface fails to load, if anything leaves the 64px side and 48px top and bottom margins, or if the card clips its own text.
- **Removed: `.github/social-preview.png`** (1200×630, which GitHub crops to 2:1). Nothing referenced it. The image to upload under Settings → General → Social preview is `docs/assets/social-preview.png`.
- **Migration:** none.

## 2026-11-10 — Ask says who wrote the answer

- **A model's answer no longer looks like the book.** A passage quoted from the book and an answer written by the server's model were the same paragraph in the book's typeface, told apart by one word in a grey line under it ("assembled" or "synthesized"). A model's answer is now set in the apparatus face (Fragment Mono, at a 68-character measure); the book's own words keep Newsreader.
- **The line that says who wrote it comes first.** Above the answer: "The book’s own words, from the best match of 3 passages." or "Written by a model from 3 passages of this book, listed under Sources." The answer box carries `data-qa-written-by` (`book` or `model`), and no value while it holds no answer.
- **The panel's opening line covers both.** "Answers are drawn only from this book and cite the sections they come from." is "Answers come only from this book’s passages. Each says whether it is the book’s own words or a model’s, and lists the passages it used."
- **The waiting status says what is happening.** "Synthesizing answer…" is "Asking this site to write an answer…", which is also true of a server with no key. The status set when the server wrote nothing ("AI synthesis unavailable. Showing local results.") is removed: the passage count replaced it before it could be read.

No config field, schema, or endpoint changed.

## 2026-11-10 — Stubs drafted by writer models, a winner chosen by judge models

- **`bookkit draft [book] <chapter>`** drafts a stub chapter in three steps. Writer commands (`--writer`, or `BOOKKIT_DRAFT_COMMAND`, one per line) each write a candidate from one brief: the stub, the book's claim, its mechanisms' contracts, a drafted chapter for length and voice, and `--notes`. The compiler checks each candidate as the chapter it would replace. Judge commands (`--judge`, or `BOOKKIT_JUDGE_COMMAND`) rank the candidates that pass, blind to who wrote which, and reject any that break the brief. `--stubs` does this for every stub of a book.
- **A draft cannot change what the author decided.** A candidate is the stub's frontmatter with the draft's body, `mechanisms:`, and `summary:`. One that is still a stub, binds a mechanism the book does not define, or has any other error is out before a judge is asked.
- **The call is a table over the ballots, not a score.** A draft most judges reject is out; of the rest, the one most judges rank above each other draft wins; with no such draft the judges split and the author picks; with every draft out there is no winner.
- **`bookkit draft apply [folder] [--pick <n>]` is the only step that writes to the book.** It refuses when the chapter has changed since the brief or the candidate no longer passes the check. `draft resume` asks the writers and judges that have not answered, and takes replies saved by hand; `draft results` counts, per command, the drafts that passed, were rejected, and won.
- **Writers are asked one at a time**, each command's candidates together, and stopped after 300 s (`--parallel`, `--timeout`): asked all at once, three of four local writers waited out their time limit behind each other. A command's terminal codes and spinner frames are removed from what it printed.
- **`bookkit judge` runs its judge commands through the same runner** (`scripts/lib/model-command.ts`); its behavior and files are unchanged. `new chapter --after` also takes a file name without `.mdx`.
- `bookkit status` names the command for the next stub. Requests live in `.bookkit/drafting/`, which git ignores.
- **A command stopped at its time limit stops what it started.** Stopping only the shell left a command such as `ollama run … | tee` running, and its reply waited until that program ended on its own; on Linux this was true even of a lone program. On Windows only `cmd` is stopped, as before.

No schema, validator, or engine module changed. A chapter written by `draft apply` counts as drafted in `bookkit bets`, which cannot tell it from one the author wrote ([bets](./docs/bets.md)).

## 2026-11-10 — The bet's scope where the tools can read it

- **`corpus.json` records what the active bet excludes.** `bet` gains `title`, `focusBook`, and `isNot`: each exclusion's name and the path prefixes that work lives under (for B1: reader UI, new frames, MCP work). `since` and `killBy` are unchanged, and a `bet` without the new fields reads as before.
- **`verify` notes out-of-bet changes.** When changed files fall under an `isNot` path it prints one line naming the excluded work and the file count, and after `killBy` says the bet needs a ruling. It is a note: no run fails on it. `--json` carries it as `bet`.
- **`bookkit bets` names the next step.** It now shows days past `killBy` instead of a negative count, the focus book's stubs with their words against the stub threshold, and the share of engine lines under excluded paths. `--json` adds `title`, `daysPastKillBy`, `focusBook`, `nextStubs`, and `engine`.
- **Closed debt rows moved.** The twelve `Done` rows of `docs/tech-debt-register.md` are, unchanged, in `docs/changelog/tech-debt-closed.md`; the register lists open debt only.
- **`validate:release:seo` is gone.** It ran `bun run validate` and nothing named it. Use `bun run validate`.

## 2026-11-10 — Reader pages say what a reader needs, in a reader's words

- **A draft is not called usable.** The draft note on the home page, the reading hub, and the chapter index said "Drafts are complete enough to use." It now says a draft is still being written, that its mechanisms keep their names and meanings, and that chapters may be outlines.
- **A chapter too short to count as drafted is labelled "outline".** The line above a chapter's title read "Chapter 2 of 11 · draft" for a two-sentence stub. Below `minIndexableWords` (60 by default, the same threshold that keeps it out of search and out of `bookkit bets`) it reads "Chapter 2 of 11 · outline".
- **About this book opens with the claim.** The page now runs: core claim, what you'll get from it, approach, core mechanisms, ground rules. Frame steps show by their labels ("Failure Modes") instead of their ids ("failure-modes").
- **Chapter pages drop engine vocabulary.** "Unlocks / Deepens:" is "Leads to:". The tools panel loses its "Executable Procedures" eyebrow, describes its links as "Actions of ten minutes or less for the mechanisms in this chapter.", and badges each "Action".
- **The chapter index no longer shows "Role-Based Reading Pathways".** The four badges (Foundational, Fast-Path, Emergency Triage, Structural Governance) were not links, did not say which chapters they held, and named an emergency path in books that have no emergencies. `deriveRolePathways` and `deriveReaderPathways` are unchanged and still exported.
- **Mechanism pages say how a mechanism differs, not that the compiler checked.** "Distinctions from adjacent mechanisms" is "How it differs from its neighbours". A mechanism from another book in the corpus shows as words ("Death of slack", "from another book") instead of a slug.
- **`/read/triage` is "Match what’s happening".** It was "Incident Triage", the name of a mechanism in the on-call book. Its labels use the toolkit page's words (When to use this, Steps, Legitimate demand), and the invented "% Match" figure is gone.

No schema, validator, or config field changed. A book that overrides one of these pages keeps its own copy.

## 2026-11-09 — Quieter passing checks, a rendered verification matrix, the changelog by month

- **`verify --all` counts warnings.** Each check prints how many warnings it has, not the list: the same standing warnings no longer fill every run (a passing run printed 9 KB; it prints under 1 KB). `--warnings` lists them. Errors always print, `--json` carries every finding, and a run scoped to a change still lists the warnings in the files it touched.
- **`bun run lint` passes with no warnings.** The 38 standing ones are fixed. `!important` in the print rules and on `[hidden]` is suppressed with its reason beside the rule, so a new use still warns. `noDescendingSpecificity` is off for CSS: with the stylesheet in partials, Biome saw only the pairs that share a file. Three helpers nothing called are gone (`buildGovernanceResult`, `printGovernanceResult`, and a frontmatter coercer).
- **The verification matrix is rendered.** `bun run verify -- --matrix` prints the path-to-checks table from the plan `verify` runs, `--write` puts it in `CONTRIBUTING.md`, and a test fails when the two differ.
- **The changelog by month.** This file holds the current month; earlier months moved, unchanged, to `docs/changelog/`.
- **CLI tests sit beside the command modules.** The tests that run `bookkit` moved, with every assertion unchanged, to `scripts/lib/commands/<group>.test.ts`, so `verify --quick` runs them for a change to that module. Nine of the eleven modules have one; `new.ts` and `diagnose.ts` do not yet.
- **Four more engine files split by concern, as pure moves.** `validators/book-validator.ts`, `validators/content-check.ts`, and `utils/markdown.ts` are entry files that re-export from smaller ones beside them; no import path, finding, or message changed. `exports/pdf-generator.ts` lost only its text encoding and outline code: `createPdfExport` is one function over shared page state and stays whole.
- **Shorter MCP tool descriptions.** The name, description, and input schema of the 15 tools went from 9.7 KB to 7.6 KB. No tool name, parameter, type, or enum changed, except that the `section` enum no longer lists `glossary` twice. `create_book` now says it runs `bun install`.

## 2026-11-09 — A quick check while iterating; the CLI and the stylesheet in smaller files

- **`bun run verify -- --quick`.** The same gates, with the tests narrowed to the change: the engine's own tests for engine code (about 3 s against 35 s for the suite), the generator's for `create-bookkit`, and for a script the test file beside it. The tests under `scripts/` that build books wait for the full run. A quick pass says the suite did not run, and `--json` carries `quick` and `note`. `bun run verify` without the flag is still the gate before a commit; CI is unchanged.
- **`scripts/bookkit.ts` dispatches.** Its commands moved, unchanged, into one module per command group under `scripts/lib/commands/`; the header of `bookkit.ts` lists them. No command, flag, or line of output changed. A project scaffolded by `create-bookkit` gets the new files.
- **`bookkit.css` lists partials.** Its rules moved, unchanged, into 23 files under `styles/partials/`, one per reader surface. `bookkit.css` imports them in cascade order and is still the package export; the built CSS is byte for byte what it was. Biome lints CSS one file at a time, so five `noDescendingSpecificity` warnings between rules that now sit in different partials no longer show.
- **`check:architecture` rejects a module listed twice.** The module map in `docs/architecture.md` had ten rows twice and passed. The repeats are gone.
- **`.ignore`.** ripgrep, and the editors and agents built on it, skip `CHANGELOG.md`, `bun.lock`, `corpus-judgments.json`, `scratch/`, and `docs/assets/` unless the file is named. Biome and every check still read them.

## 2026-11-07 — Modernization: draft-time corpus governance and tooling configuration

- **Draft-time corpus hints in chapter checks (serving bet B1).** `chapterDraft` and `bookkit check <chapter.mdx>` now inspect draft prose against mechanisms defined across the shared corpus (`corpus.json` `books`). When draft prose touches or mentions existing mechanisms that are not yet bound, it surfaces actionable guidance: binding the slug locally if already present in the book, or sharing it from a sibling book with `bun run bookkit sync <slug> --to <book>`. The hints are surfaced directly in CLI output and in `--json` payloads for MCP clients and editors, preventing concept duplication at write time.
- **Modernized Biome configuration.** `biome.json` migrated to the 2.5/2.6 schema format with `"preset": "recommended"`, eliminating deprecation warnings during format and CI runs.

## 2026-11-06 — Strict architecture DAG: zero import cycles and enforced invariants

- **Zero import cycles across the engine.** The two historically declared import cycles (`frames` ↔ `validators`, `book` ↔ `components` ↔ `layouts`) are eliminated. `frames/` has zero dependencies (Tier 0); `validators/` (Tier 1) imports `frames/` strictly downward. `computeLayoutMetadata` lives in `book/layout-metadata.ts` (Tier 4), and reader shell components (`ReadingProgressBar`, `VersionSwitcher`, `LanguageSwitcher`) live in `layouts/book-layout/` (Tier 5), with thin wrappers in `components/` (Tier 6). The entire engine forms a strict DAG across tiers 0 to 7 verified by `bun run check:architecture`.
- **DAG cycle detection enforced on chapter prerequisites.** `detectCycles` in `utils/graph.ts` (re-exported by `book/graph.ts`) is now called by `checkBookContent`. Circular prerequisite chains between chapters emit a blocking `PREREQUISITE_CYCLE` error with actionable fixes, enforcing Invariant 4.
- **Frames are structurally enforceable.** Missing required frame steps (`FRAME_STEP_MISSING`) are surfaced on whole-book validation and blocked on standalone document checks (`validateFrameSteps`, `bookkit check --frame`), upholding Invariant 2.
- **Author decisions in `book.config.ts` are validated against content bindings.** The validator now checks that every slug declared in `book.config.ts` `mechanisms: [...]` exists in `src/content/book/mechanisms/` (`UNKNOWN_MECHANISM`), that mechanism files in content are registered in config (`UNLISTED_MECHANISM`), and that mechanism counts conform to `constraints.mechanismCountTarget` (`MECHANISM_COUNT_TARGET`).
- **Governance pipeline in `docs/architecture.md` documents `corpus.json`.** Architecture documentation now reflects cross-book mechanism identity governance, zero declared cycles, and updated module tiers.

## Earlier months

- [October 2026](./docs/changelog/2026-10.md)
- [September 2026](./docs/changelog/2026-09.md)
