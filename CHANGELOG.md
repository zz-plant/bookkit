# Changelog

Dated, documented behavior changes to the Bookkit engine, schemas, validators, and scripts.
Per-book editorial history lives in each app's `src/content/book/releases/`.
This file holds the current month, newest first. Earlier months are in `docs/changelog/`, one file each; when a month ends, its entries move there.

## 2026-11-10 — Stubs drafted by writer models, a winner chosen by judge models

- **`bookkit draft [book] <chapter>`** drafts a stub chapter in three steps. Writer commands (`--writer`, or `BOOKKIT_DRAFT_COMMAND`, one per line) each write a candidate from one brief: the stub, the book's claim, its mechanisms' contracts, a drafted chapter for length and voice, and `--notes`. The compiler checks each candidate as the chapter it would replace. Judge commands (`--judge`, or `BOOKKIT_JUDGE_COMMAND`) rank the candidates that pass, blind to who wrote which, and reject any that break the brief. `--stubs` does this for every stub of a book.
- **A draft cannot change what the author decided.** A candidate is the stub's frontmatter with the draft's body, `mechanisms:`, and `summary:`. One that is still a stub, binds a mechanism the book does not define, or has any other error is out before a judge is asked.
- **The call is a table over the ballots, not a score.** A draft most judges reject is out; of the rest, the one most judges rank above each other draft wins; with no such draft the judges split and the author picks; with every draft out there is no winner.
- **`bookkit draft apply [folder] [--pick <n>]` is the only step that writes to the book.** It refuses when the chapter has changed since the brief or the candidate no longer passes the check. `draft resume` asks the writers and judges that have not answered, and takes replies saved by hand; `draft results` counts, per command, the drafts that passed, were rejected, and won.
- **Writers are asked one at a time**, each command's candidates together, and stopped after 300 s (`--parallel`, `--timeout`): asked all at once, three of four local writers waited out their time limit behind each other. A command's terminal codes and spinner frames are removed from what it printed.
- **`bookkit judge` runs its judge commands through the same runner** (`scripts/lib/model-command.ts`); its behavior and files are unchanged. `new chapter --after` also takes a file name without `.mdx`.
- `bookkit status` names the command for the next stub. Requests live in `.bookkit/drafting/`, which git ignores.

No schema, validator, or engine module changed. A chapter written by `draft apply` counts as drafted in `bookkit bets`, which cannot tell it from one the author wrote ([bets](./docs/bets.md)).

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
