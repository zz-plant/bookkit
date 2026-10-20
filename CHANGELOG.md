# Changelog

Dated, documented behavior changes to the Bookkit engine, schemas, validators, and scripts.
Per-book editorial history lives in each app's `src/content/book/releases/`.

## 2026-10-20 — Commands that read the way they are typed

- **`bookkit new`** no longer reads an option's value as a title or a book: `new mechanism "<title>" --definition "<sentence>"` after `bookkit use` was refused with `Book "<title>" not found`. An option `new` does not have is named instead of being read as an argument, and `new book --title "…" <slug>` works in any order. `new book` makes the new book the current one.
- **The current book is the default** for `bookkit check` (add `--all` for every book) and `bookkit status <book>` shows that book's commands. Status lists every stub to write, not only the next.
- **`bookkit dev stop` and `dev status`** find the server `bookkit dev` runs in another terminal (recorded in `.bookkit/dev/`) and stop it; Astro's JSON answer for a background server prints as its message. `bookkit dev` no longer shows Astro's upgrade notice for the version the workspace pins.
- **`bookkit propose`** ends with the command that writes its proposals, accepts `--apply all`, refuses `--apply` with no kind instead of doing nothing, and answers `--help`.
- **Book warnings keep their fix**: `bookkit check`/`validate` print the fix under a warning that has one, such as a framing chapter's missing steps; a file missing several fields gets one note pointing at `bookkit check <file>`.
- **`bookkit build <book>`** ends with where the site, PDF, and EPUB are, and the deploy rehearsal to run next.
- **Smaller**: `bookkit check <mechanism file>` stops suggesting merge or rule once every similar pair is ruled; the unknown-mechanism fix names `bun run bookkit similar` as well as the agent tool; status says "1 mechanism", not "1 mechanisms".
- **Migration:** none. Scripts that ran `bookkit check` with no book after `bookkit use` and expected every book should add `--all`.

## 2026-10-20 — Judges asked and recorded in one command

- **`bookkit judge` asks the judges itself** when it has a judge command: `--run "<command>"`, or `BOOKKIT_JUDGE_COMMAND`, any program that reads a prompt on stdin and prints its reply (an LLM's command-line tool, such as `claude -p`). Each judge is its own run of the command, all at once, in an empty folder of its own, so it sees nothing but its prompt; a reply that answers every pair is saved as `answer-<n>.json` and the answers are recorded. Before, each prompt was handed to a session by hand, each reply saved by hand, then `bookkit judge record`. `--no-run` writes the prompts only.
- **`bookkit judge run [folder]`** asks again the judges of a request (default: the newest) that have no answer. A reply that fails is kept in `judge-<n>/reply.txt`, and nothing is recorded until every judge has answered.
- **Each prompt holds its pairs**: `judge-<n>/prompt.md` now ends with that judge's pairs, so it can be pasted into any chat or piped to any command as is, instead of naming a file for the judge to read. `pairs.json` is still written beside it.
- **`bookkit new mechanism --definition "<one sentence>"`** writes the definition into the new file (it was used only to look for similar mechanisms). At the keyboard, when similar mechanisms are listed, it asks whether to create it anyway instead of asking for a rerun with `--force`.
- **Migration:** none. A request folder written before this change still records with `judge record`; its prompts name a file, so to have it asked by a command, write a new request.

## 2026-10-20 — Merging two mechanisms is one command

- **`bookkit merge <keep> <drop> --reason "<why>"`** carries out the author's ruling that two mechanisms are one idea, in every book of their corpus. `<drop>` becomes `<keep>` with one contract: `<keep>`'s title and definition (`--definition` writes a new one) and both mechanisms' `is`, `isNot`, `predictions`, `tests` and `satisfies` without repeats. A book that had only `<drop>` gets `<keep>`'s slug and keeps its own prose; a book that had both keeps `<keep>`'s file with `<drop>`'s prose after it. `<drop>`'s glossary entry and examples move to `<keep>`, and the old term stays as "Also called …". References are rebound: `mechanism:`/`mechanisms:` frontmatter, `/read/` links, slug strings in `book.config.ts` and pages (an entry `<keep>` already has is dropped instead), and slug-only list items. Tools keep their slugs and URLs. `corpus.json` gets the `merged` record with both mechanisms as they were, and distinct rulings on `<drop>` carry over to `<keep>` unless `<keep>` has its own. The output lists every change and the lines that still name `<drop>`; `--dry-run` writes nothing. It refuses a pair ruled distinct, a pair across corpora, and copies of either mechanism that already differ. Before, a merge was done by hand: the first one touched 11 files in two books, and missed a page.
- **`bookkit sync <mechanism> [--from <book>]`** copies one copy's contract, by default the one edited last, to the mechanism's other books in its corpus, so a shared contract is edited once. `check:corpus`'s drift message names it.
- **Hints** that said "bind that slug instead" or "merge them" now give the `bookkit merge` command: `bookkit check <mechanism file>`, the corpus report, and `judge record`'s pairs to settle. `bookkit rule --same` points at `merge`.
- **Migration:** none. A merge removes `/read/mechanisms/<drop>` and `/read/glossary/<drop>`, as a hand merge did; for a published book, say so in its release notes.

## 2026-10-20 — propose writes prerequisite edges

- **`bookkit propose <book> --apply edges`** writes accepted prerequisite edges into the chapters' `prerequisites:`, in the list's own layout (a chapter without one gets it before `mechanisms:`). Before, `--apply mechanisms` printed the edges and "edit chapter frontmatter to list these prerequisites". The reading graph stays acyclic: an edge that would close a loop is skipped and named, and when two chapters would each require the other, the later one in reading order requires the earlier. Another `--apply` without `edges` says how many edges were left unwritten. The proposal bundle's command lists `--apply edges`.
- **Migration:** none.

## 2026-10-20 — One path from a new mechanism to a ruling

- **`bookkit judge [mechanism]`** writes a blind request for judges under `.bookkit/judging/` (gitignored): one folder per judge, three by default (`--judges <n>`), each with a prompt that names the full path to its own copy of the pairs, in its own order, so it can be handed over as is. With a mechanism it asks about that one's three nearest pairs with no verdict or ruling; without, about the corpus (`check:corpus --judge-prompt`). Before, the request was `bun run check:corpus -- --judge-prompt <dir>` with a folder you chose, often inside the repository, and one `pairs.json` all judges shared.
- **`bookkit judge record [folder]`** reads the newest request that has answers (`--judge-record`) and lists the pairs left to settle, each with its `bookkit rule` command.
- **`bookkit rule <a> <b> --distinct "<reason>"`** adds the ruling to `corpus.json` as text in the file's own layout (the rest of the file is untouched, and Biome keeps it as written). It checks that both are mechanisms of one corpus, the shared one or a book `check:corpus` checks on its own (suggesting the closest slug for a typo, and explaining that a pair across corpora needs no ruling), refuses a pair already ruled, and asks for the reason in the author's words, showing the judges' draft when there is one. Merges stay by hand.
- **Every hint names the next command**: `new mechanism`, `bookkit check <file>`, the corpus report's clusters, and `judge record` point at `bookkit judge` and `bookkit rule` instead of `check:corpus` flags or "edit corpus.json". `bookkit check` names a mechanism's unjudged nearest only when it ranked them by meaning, as `bookkit judge` does.
- **`bookkit new book <slug> --from <folder>`** creates the book and imports the folder; `bookkit try` prints that one command instead of three. `scaffold-book --no-next` leaves out the next steps the import then prints.
- **Migration:** a request folder written by `check:corpus --judge-prompt` now holds `judge-<n>/prompt.md` and `judge-<n>/pairs.json` instead of one `prompt.md` and `pairs.json`; answers still go in the request folder as `answer-<n>.json`.

## 2026-10-20 — check:types skips unchanged projects; judges at write time

- **`check:types` remembers passes.** Each project's check (TypeScript or `astro check`) is skipped while nothing it reads has changed since it passed: its own folder, the folders it imports from (a book app: the engine; `scripts/`: the packages), `bun.lock`, `package.json`, `tsconfig.base.json`, and an app's generated `.astro/` types. On a 4-core machine: 21 s for everything, 0.13 s when nothing changed, 1.2 s after a change to `scripts/` only, about 6 s after a change to one app. A failure is never recorded, so it is reported on every run until fixed. Records live in `node_modules/.cache/bookkit-typecheck`; `--no-cache` ignores them, and CI (`CI` set) never reads them.
- **Measured and left alone:** checking the 18 shared pages once instead of in every app would save about 2 s, because three quarters of each `astro check` run is fixed start-up cost; and `bun test --changed` picks no test for a change to `scripts/check-corpus.ts`, which three test files run as a child process, so test selection by imports would skip real coverage.
- **Judges where they can matter.** `check:corpus --judge-prompt <dir> --judge-for <slug>` asks about one mechanism only: its flagged or changed pairs, then its three nearest pairs with no verdict or ruling (every merge on record was among the two closest pairs in the corpus). `bookkit check <mechanism file>` now shows the judges' calls on that mechanism (the same idea as another, or a split, unless corpus.json already rules the pair) and prints that command when its closest pairs have no verdict, so a new mechanism is judged as it is written rather than in a batch.
- **Migration:** none.

## 2026-10-14 — Judges in check:corpus, and faster builds and checks

- **`check:corpus` reads judges' verdicts** (bet B1). `corpus-judgments.json` holds answers to the author's merge rule (same lever, same evidence, and which relation holds), asked blind of an LLM or a person who sees only the two texts. A pair any judge calls the same idea is now flagged even when its wording differs, and joins the clusters `--mode error` fails on until the author rules. Every flagged pair shows the judges' call: likely one mechanism, a split for the author to settle, or not the same idea with a draft reason for the `corpus.json` ruling. Verdicts carry a hash of both texts and stop applying when either changes; the report lists those pairs. `--judge-prompt <dir>` writes the blind question for the pairs worth asking, and `--judge-record <dir>` reads the answers back. Engine: `decidePair`, `evaluateJudgments` (suggestions), and a `judgments` option and `"judged"` flag on `analyzeCorpusOverlap`.
- **`check:corpus --eval` scores the judges** against the rulings: the decision table gets 17 of 18 right, 0 wrong, and leaves 1 to the author; the same judges' lever-times-evidence score with a leave-one-out cutoff gets 2 wrong. `--eval --json` now returns `{ models, judges }` instead of the models array.
- **Stored vectors.** The meaning pass keeps each mechanism's vector beside the model and embeds only texts it has not seen: `check:corpus` 5.6 s, then 0.2 s on later runs, with the same report.
- **Link previews rasterize in parallel** (resvg on the thread pool): a cold image pass 2.2× faster, the PNGs byte-identical. CI and deploy keep the image cache between runs.
- **`check:types` runs TypeScript and `astro check` on one queue**, the longest job first: 27 s against 32–36 s on four cores. **`bun run test` runs test files in parallel**: 20 s against 43 s.
- **Fixed:** the MCP command runner loaded `node:child_process` with a top-level await, and under Bun 1.3 a tool call could run before it settled ("Cannot access 'runWorkspaceCommand' before initialization"); it also did not pass changes to `process.env` on to the child. Both only showed when its test file ran first.
- **Migration:** none for content. A pair now flagged by judges needs a ruling like any other flagged pair; none is flagged today. A consumer of `check:corpus --eval --json` reads `.models` for what it used to get.

## 2026-10-14 — Ease-of-use pass

- **Fixed: a standalone project from `create-bookkit` could not import or suggest.** It copied scripts that import files it did not copy: `lib/import-markdown.ts` (added with `bookkit try`, in the entry below) and `lib/load-book.ts` (older, so `bun run suggest` had been failing). The copy list is now one module, and a test fails when a copied script imports something a standalone project does not have.
- **`create-bookkit --dir` installs before it imports**, since import now reads frontmatter with the project's own dependencies (without it, Bun fetched an incompatible js-yaml), and it resolves `--dir` where you typed it. Before, a relative `--dir ./notes` was looked up inside the new project.
- **Import's next steps name commands that exist**: the `bookkit` commands in this repo, and `suggest`, `validate`, and `dev` in a standalone project.
- **`deploy` and `build` follow the current book.** With no book named, they act on the book set with `bookkit use`, as the help always said, instead of every book; `--all` means every book. `bun run deploy` and the deploy workflow pass `--all`, so what they publish is unchanged. A mistyped book now gets a suggestion from `deploy` too, and `deploy` says which books it is about to publish.
- **`bookkit dev` streams Astro's own output.** It runs in the book's folder instead of through `bun --filter`, whose view kept only the last few lines, so a later error could scroll out of sight. `bookkit dev stop|status|logs [book]` controls a server Astro put in the background (it does that under an AI agent, and its own `astro dev stop` only works inside the app).
- **The meaning check says when it downloads its model.** The first semantic run of `check`, `similar --semantic`, or `check:corpus` fetches about 520 MB without a word; it now says so on stderr, once.
- **Migration:** if a script relied on `bookkit deploy` or `bookkit build` with no book meaning every book while a current book is set, add `--all`.

## 2026-10-14 — Bookkit on folders it doesn't own

- **`bookkit try <folder>`** shows what any folder of Markdown would become, and writes nothing: the frame it fits (detected, or `--frame`), how many documents already carry each of the frame's sections, named ideas that recur across documents, files that break the content contract, text MDX could not compile, and the commands that turn the folder into a book. `--json` returns the same as data.
- **`bookkit check <folder|file>`** runs the same analysis as a gate on Markdown wherever it is, with no book app: contract files (in a section folder, or marked by their frontmatter) are checked field by field, and `--frame <slug>` requires the frame's sections. It exits 1 on an error, so a runbook folder can be gated in CI where it lives. Inside `apps/<book>/`, `check <file.mdx>` and `check <book>` are unchanged; a bare name is still a book, so a mistyped one still gets a suggestion.
- **A frame's sections in a loose folder.** For the runbook and field-guide frames, each loose document must carry every required step; for the others, and for any folder that is already book content (it has `chapters/`), the folder as a whole must, as `validate` requires of a book. A section counts when a heading, or a field line such as `**Owner:** Payments`, has a word that starts like the step (`frameStepsInHeadings`: "Owner" covers ownership, "Verify" verification). This is a new, opt-in rule for folders; book validation is unchanged.
- **`bookkit import` takes real exports.** A source's frontmatter no longer produces a second YAML block: its `title`, and `summary` or `description`, carry into the chapter's. A leading `# Title` becomes the title instead of repeating on the page. Titles are quoted safely (a colon or quote in a title broke the YAML before). Text MDX cannot compile is converted (`toMdxBody`): HTML comments to MDX comments, autolinks to links, and braces and tag-like `<placeholders>` escaped, leaving code untouched. Before, a runbook with `{env}` or `<service>` in its prose imported fine and then failed the build.
- **`import` and `propose` take the book first** (`bookkit propose running-hot`), or default to the current book. Before, they required `--book`, and the README's own recipe (`propose <slug>`) failed.
- **Migration:** none. Engine additions: `previewFolder` (proposals), `frameStepsInHeadings` (validators), `toMdxBody` (utils).

## 2026-10-14 — `bookkit deploy` refuses invalid content

- **Fixed: `bookkit deploy` published books whose content failed validation.** It built each book and checked only its `dist/`, and a build renders a tool with `timeboxMinutes: 45` or an unknown mechanism without complaint. Run from a laptop, deploy could publish what CI would have rejected. It now runs the per-book content check `bun run verify` runs (`checkBookContent`) before building. A book with any error is refused the way a failing `check:build` already was: a `CONTENT <book>: failed` line, each error with its file and fix, `Refusing to deploy <book>: its content failed validation.`, and exit 1, which ends the run. Warnings are counted, not listed, and do not block.
- **`bookkit build` is unchanged** and still builds a book with content errors. Builds belong to the render pipeline and content checks to the governance pipeline (`docs/architecture.md`); `dev` and `build` keep working on drafts.
- **Migration:** none for a book that passes `bun run verify`. A book with content errors no longer deploys until they are fixed.

## 2026-10-14 — README images show real output

- **The README's images are new.** The 2.9 MB GIF of a generic open book is replaced by screenshots of two built On-Call Runbook pages, in a light and a dark version. "How a book compiles" gets a diagram of the inputs, the gates, and the artifacts, and the line "AI may propose; the compiler decides." gets the real output of `bookkit check` rejecting a toolkit action broken on purpose. Both are SVG in light and dark versions, with the books' typefaces embedded as subsets, so the text stays text.
- **`docs/assets/social-preview.png`** (1280×640) is the repository's link card. GitHub only takes it through Settings → General → Social preview.
- **Removed: the template scene generator.** `scripts/generate-scenes.ts`, `scripts/check-assets.ts`, the `assets:generate` and `assets:check` scripts, `docs/assets/source.svg`, and the 20 PNGs in `docs/assets` that no page or doc used. `docs/assets` went from 3,502,984 to 233,647 bytes.
- **README corrections.** Step 3 of "How a book compiles" listed ordering constraints as a gate, but no gate checks chapter order (`check:suggestions` proposes missing prerequisite edges instead). It now names the gates `verify` runs and says the frame check is a warning. Step 1 names the explainer frame.
- **Migration:** none. Drop `bun run assets:check` or `assets:generate` from any local script that called them.

## 2026-10-14 — Commercial roadmap removed

- **`docs/commercial-roadmap.md` is gone.** Bookkit is a CC0 project with nothing to sell, and `docs/bets.md` already decided what gets worked on. Its engineering facts moved: what MCP and governance-API hardening has and lacks, and what reader forking would be, are under parked work in `docs/bets.md`; the error payload's `severity` and `gateLevel` are in `docs/design-notes.md`. Recover the file with `git show 0014496:docs/commercial-roadmap.md`.
- **Pitch wording replaced** in the README, design notes, bets, debt register, architecture doc, and the on-call TODO list: "wedge" and "per-customer" are gone, and the design notes no longer call the repo "safe to recommend". Dated entries below keep their original wording.
- **Migration:** none.

## 2026-10-14 — Release SEO gate reads real configs; reader UI survives blocked storage

- **Fixed: `validate:release:seo` failed every book with `RELEASE_SITE_URL`.** The `book.config.ts` reader skipped `bookConfig = { ... } as const`, the form every app uses, so it never saw `site.url`. It now looks through `as const` and `satisfies`, and follows a shorthand `{ site }` to its binding. `on-call` and `bad-people` now pass the gate; `crumple-zone` and `running-hot` report `RELEASE_NOT_INDEXABLE` for their literal `indexable: false`, which the gate had been missing. The reader moved to `scripts/lib/site-config.ts`. **Migration:** none.
- **Fixed: with storage blocked, the book layout's script failed to load.** Browsers that block site data throw a SecurityError on any read of `window.localStorage`, and `ui.ts` read it at load, so search, Q&A, keyboard shortcuts, reader settings, the mobile menu, analytics and Mermaid diagrams never started. Storage is now looked up on use, and a blocked read or write is skipped. **Migration:** none.

## 2026-10-14 — Reader search reports its real backend

- **Fixed: semantic search said "Model loaded (WebGPU)." while running on WebAssembly.** `createEmbeddingEngine` passed WebGPU options that `@xenova/transformers` v2 does not support and silently ignores, so the WebGPU branch always "succeeded". It now loads once and reports "Model loaded."; the "GPU acceleration unavailable." message is gone too. Search results are unchanged. **Migration:** none.

## 2026-10-14 — Book sites draw their icons at build

- **The Bookkit integration draws each book's favicon and touch icon after a build**, beside the link-preview images, from the home page's `og:site_name`: the short title's initial (after a leading "The", "A" or "An"). Before, each app committed its three files and `new:book` and `create-bookkit` copied Bad People's, so every new book shipped its "B".
- **Files in a book's `public/` still win.** Running Hot keeps its committed "R", since its title starts "Don't Turn People…". Bad People, The Crumple Zone and On-Call drop theirs; the drawn icons match them.
- **`bookkit()` loses its unused `injectRoutes` option.** Nothing read it.
- **An icon never fails a build.** A title Newsreader can't draw (Greek, CJK, or no letter at all) logs a warning and ships without icons; before, it drew the font's empty box. Latin Extended and Vietnamese initials now draw.
- **Fixed: a book scaffolded with `new:book` or `create-bookkit` failed to build.** The home page it copies from Bad People read `bookConfig.author.name`, and scaffolded configs have no `author`. The byline now shows only when there is one.
- **Migration:** none for existing books. `astro dev` serves no icons unless they're in `public/`, as with link-preview images.

## 2026-10-09 — Book sites get icons

- **`BookLayout` links a favicon and a touch icon.** Every page's head now carries `/favicon.ico`, `/favicon.svg` and `/apple-touch-icon.png`. Before, no book had any, so tabs, bookmarks and home-screen shortcuts showed the browser's blank page.
- **Each book app ships its three files in `public/`**: its title's initial, in the rubric on paper, set in Newsreader. The SVG carries the letter as a path, so it doesn't depend on the reader's fonts.
- **Migration:** a new book app needs the same three files in `apps/<book>/public/`, or those three requests 404. Nothing else changes.

## 2026-10-08 — A gentler `bookkit`

- **`bookkit use <book>`** remembers the book you're working on, in `.bookkit/local.json` (gitignored). `new chapter|mechanism|tool|example`, `dev`, and anything else that takes a book then default to it: `bun run bookkit new chapter "Repair has a clock"`. `use` with no argument shows the current book; `--clear` forgets it.
- **`bookkit` (status) names the next thing to write**: the current book's first stub in reading order, with its word count and the `check` command for it.
- **Prompts at a terminal.** `bookkit new` with no kind asks what to start. A missing book, title, mechanism, or domain is asked for, and mechanisms are offered as a numbered list from the book. Scripts and agents (no terminal) get the same usage errors as before.
- **Suggestions for typos**: unknown commands ("chek" → check), books ("runninghot" → running-hot), `new` kinds, and mechanisms. An unknown command no longer prints the whole help.
- **Fixed: `new tool` and `new example` accepted a mechanism the book doesn't have**, writing a file the validator then rejected. They now refuse it and name the closest real one.
- **Fixed: the stubs `status` listed came in directory order**, not reading order.
- **Script traps fixed.** `bun run check` ran the asset check; it now runs `bookkit check` (`assets:check` is unchanged). `bun run qa` is now `verify -- --all`, exactly what CI runs.
- The README opens with the six commands a writer uses. The runbook demo is shorter, and the developer summary says to run `verify`, not `validate`, before a PR.

## 2026-10-08 — One gate, one validator, one parser

**Connected**
- **CI runs `bun run verify -- --all`.** It replaces the separate steps, so the gate list in `scripts/lib/verify-plan.ts` is the only one. Two checks CI never ran are now in it:
  - mechanisms across books (`check:corpus --no-semantic --mode error`): unresolved overlap, drifted shared contracts, or stale rulings fail;
  - named concepts (`check:floating-concepts --json`): reported as warnings, never failing. Content changes get this gate locally too.
- **CI annotates the PR.** On GitHub Actions, `verify` writes each error finding that has a file as an annotation; when scoped to a change, it writes warnings too.
- **`bun run bookkit` (status) measures bet B1's test** from git history, against the last commit before `bet.since` in `corpus.json` (new): chapters drafted since, mechanisms added and merged away, and which drafted chapters bind a new mechanism. `status --json` is now `{ books, b1 }`.
- **Duplicate check in the per-file check.** `bookkit check <mechanism file>` and the MCP `check_content` tool list existing mechanisms in any book that share its wording (score ≥ 0.3), noting pairs `corpus.json` already rules distinct.
- **New `.github/workflows/deploy.yml`.** It publishes every book on merge to `main` with `bookkit deploy`, and does nothing until the repository has a `CLOUDFLARE_API_TOKEN` secret.

**Streamlined**
- **One frontmatter parser** (`utils/frontmatter.ts`, full YAML) replaces six: the validator's, the scripts', the MCP resources', the old in-memory validator's, the search index's, and the PDF/EPUB export's. The last three were line-by-line parsers that dropped lists and kept escaped quotes. Built output is unchanged: HTML and search indexes are byte-identical across all four books, and exports differ only in their timestamps.
- **One validator.** `checkBookContent` (`validators/book-validator.ts`) runs the shared per-file checker over a book and adds the frame check. `bun run validate`, MCP `validate_book` (now in-process, with no subprocess and no second set of diagnostics), and the validate script `create-bookkit` writes (through `validateBookInMemory`) all call it. `validate` text output is unchanged on all four books in normal and release mode.
- **Scaffolds come from the contract.** `bookkit new mechanism|tool|example`, `new chapter`, and `propose --apply` build files with `scaffoldSource`: the given values in contract order, and each field left to write as an empty placeholder whose YAML comment says what goes there. Every scaffold has no errors; the empty fields are warnings.

**Fixed**
- `bookkit new tool`, `new mechanism`, and `propose --apply` wrote an HTML comment (`<!-- … -->`) into MDX, which fails the book's build. They now write `{/* … */}`, and the checker reports `MDX_HTML_COMMENT` for any MDX body with an HTML comment outside code.
- `bookkit new mechanism` wrote the title unquoted, so a title with a colon was invalid YAML. Values are now quoted where YAML needs it.
- `bookkit check <file>` failed on examples, which sit one folder deeper (`examples/<mechanism>/`).
- The concept check flagged "How Wall Street" as a coined concept: a sentence-initial word is no longer part of a phrase, and "Wall Street" joins the proper-noun allowlist.

**Migration:**
- `bookkit status --json` returns `{ books, b1 }` instead of an array.
- `validateBookInMemory` findings use the shared codes (`FIELD_MISSING`, `UNKNOWN_MECHANISM`, …) instead of `MECHANISM_SCHEMA_INVALID` / `TOOL_SCHEMA_INVALID` / `TOOL_UNKNOWN_MECHANISM`, and it now requires every content folder.
- MCP `validate_book` no longer returns `stdout` or `diagnostics`; read `findings`.
- The verify gate parse mode `validate-json` is renamed `findings-json`.

## 2026-10-08 — Content an agent can make compile

The compiler stays the judge; agents get what they need to satisfy it. No model is added to the build or the validator.

- **New: content contracts** (`validators/content-check.ts`). Each section (mechanism, tool, example, chapter, glossary) has one definition:
  - every field, whether its absence is an error or a warning, and what to write in it;
  - the frontmatter's JSON Schema, generated from the Zod schema the build uses;
  - a template that compiles with no findings.
  The validator, the MCP tools, and the CLI all read this definition, so what an agent is told is what the compiler enforces.
- **`validate-book --json` findings carry `code`, `field`, and `fix`.** For example: `FIELD_MISSING` / `trigger` / "Add `trigger:` (The situation that tells the reader to use it, in one sentence.) For example: …". Text output is unchanged; `bun run verify` reads the same findings.
- **New MCP tools:**
  - `bookkit.get_content_contract` returns the contract.
  - `bookkit.check_content` compiles one candidate file without writing it, checking mechanism references against the book. Draft, check until ok, then write.
- **New CLI commands:** `bun run bookkit contract [section]`, and `bun run bookkit check <file.mdx> [--json]` for one file.
- **Better fixes for unknown mechanisms.** A reference to a slug merged away in `corpus.json` names its replacement ("coercion-by-design was merged into refusability-gap on 2026-10-08; use refusability-gap"). Any other unknown slug gets the closest existing ones, matched on words longer than three letters.
- **Fixed: `bookkit.validate_book` said "Validation passed" for books with errors.** `validate-book` exits 0 in warn mode, and the tool judged by exit code. It now runs `--json` and judges by the findings.
- **Fixed: invalid YAML frontmatter was reported as "missing frontmatter".** It is now `FRONTMATTER_INVALID`, with the parser's reason and line.
- **Stricter: a chapter's `mechanisms:` entries must exist in the book** (an error, as for tools and examples). No current chapter breaks this.
- An empty list item (`- ""`) counts as missing, and a missing field is reported once, not again as a schema issue.
- `toFindings` is removed from `scripts/lib/authoring.ts`; the validator builds findings directly.

**Migration:** none for content that validated before. Scripts that matched schema-issue text should read `code` and `field` instead. That text is now "<Section> schema issue at <path>: <reason>", and glossary entries without a term say "Glossary missing term".

## 2026-10-08 — Link previews, bylines, and the last open mechanism pair

- **Every page gets its own PNG link preview.** The `bookkit()` integration renders a 1200×630 image for each built page after `astro build`, set in the reader's two voices on the book's paper: the page title in Newsreader, the section label and host in Fragment Mono, the short title and byline as a running foot. Images live at `/og/<page path>.png` (`/og/index.png` for the home page) and carry `og:image:width`, `og:image:height`, and alt text. Renders are cached by content in `node_modules/.cache/bookkit-og`, so an unchanged page costs nothing on rebuild; a cold build of one book adds about 6s.
  - **Fixed: three books showed the wrong preview.** The SVG placeholders in `public/og/` said "Bad People" for crumple-zone and on-call, and social sites do not render SVG previews at all. The placeholders are removed.
  - The template's `astro.config.mjs` now uses `bookkit()` instead of repeating its Vite settings inline.
  - New engine dependencies, used at build time only: `satori`, `@resvg/resvg-js`, `@fontsource/newsreader` (static WOFF; satori reads no WOFF2).
- **`check:build` fails when a page names a preview image the build did not write**, and warns when a preview is SVG.
- **New: `author` in `book.config.ts`** (`{ name, url? }`). It adds a byline to the colophon on every page and to link previews, plus `<meta name="author">` and a schema.org `Person` as the page's and the site's `author`. The three nonfiction books set it; the home pages show it under the title.
- **`bookkit deploy` says when the Worker does not serve `site.url`'s domain**, and how to attach one: a `custom_domain` route in the app's `wrangler.jsonc`.
- **Corpus:** `crumple-zone/coercion-by-design` is combined into `refusability-gap` (same lever and evidence), and `bureaucracy-moral-technology` ~ `clearance-culture` is ruled distinct. nomic's cutoff moves from 0.80 to 0.79, the highest that still flags all three recorded merges. 30 mechanisms, 2 shared, 0 unresolved.

**Migration:**
- Books outside this repo: run `bun run sync:shims` to switch `astro.config.mjs` to `bookkit()`, and delete `public/og/*.svg` unless you made your own; a page that passes its own `ogImage` keeps it.
- `DEFAULT_OG_SURFACE_IMAGE_MAP` is removed, and `getOgImageForPath(path)` takes no map: it returns the generated image's path.
- `defaultMeta.ogImage: "/og/default.svg"` is dropped from the scaffolds; that file was never generated.
- crumple-zone is a draft: `/read/mechanisms/coercion-by-design` and `/read/glossary/coercion-by-design` are gone. Use `refusability-gap`; its glossary entry keeps "coercion by design" as an alias.

## 2026-10-07 — Find similar mechanisms by meaning

- **`bookkit similar "<title>" --semantic`**, and `semantic: true` on the `bookkit.find_similar_mechanisms` MCP tool, rank existing mechanisms by meaning with `check:corpus`'s embedding model. If the model can't load, it falls back to wording and says so. A warm lookup takes about 10s.
  - Example: "Waiting as leverage" with a one-sentence definition ranks `delay-as-force` first by meaning (0.83, next 0.76). By wording, the same query put it fourth behind mechanisms that merely share common words.
- **Wording-based ranking weighs rare words more.** Words that most mechanisms use, such as "people" and "institution", count for little. Stemming no longer turns "less" into "les".
- The result field `overlap` is renamed `score`. It is a weighted word share for wording and cosine similarity for meaning.

## 2026-10-07 — Bookkit's MCP tools over stdio

- **New: `bun run mcp`**, a stdio MCP server built on the engine's existing JSON-RPC router. It needs no dev server, and `.mcp.json` registers it as `bookkit` for Claude Code. The content tools read one book (`-- --book <slug>`, default the first). The workspace tools (`list_books`, `validate_book`, `compile_book`, `export_book`, `check_separation`, `create_book`) take a book argument as before. It answers malformed lines with JSON-RPC errors instead of exiting.
- **Two new tools for bet B1:**
  - `bookkit.find_similar_mechanisms`: existing mechanisms in any book that share a proposed mechanism's wording, and whether its slug already exists. It runs the new `bookkit similar "<title>" [--definition …] [--json]`.
  - `bookkit.check_corpus`: overlap clusters, drift, and stale rulings across the corpus books; wording only unless `semantic: true`.
- **Fixed: tool results were not valid MCP.** `tools/call` returned `content: [{ type: "json", json }]`, a content type MCP clients reject. It now returns a `text` item holding the JSON, the same object as `structuredContent`, and `isError` when the tool reports `ok: false`.
- **The router answers `ping`.**

**Migration:** HTTP clients of `/api/mcp.json` that read `result.content[0].json` should read `result.structuredContent` instead (same object).

## 2026-10-07 — One set of agent skills; search links that land

- **Every agent tool reads the same skills.** `.opencode/skills` is now a symlink to `.codex/skills`, as `.claude/skills` already was. A new `verify` skill (run `bun run verify` and read its summary) replaces the old `qa` checklist. That checklist was tracked inside `.agent/`, which `.gitignore` excludes. The `verify` skill is also listed as an MCP governance resource, and the `content-edit` and `engine-change` skills now lead with `bun run verify`.
- **Fixed: `.opencode` commands and modes ran the wrong things.** `check` and `build` both ran `bun run assets:check||vitest run`, and three modes called a nonexistent `bun run typecheck`. They now run `verify`, `build:all` with `check:build`, and `verify -- --all` before a deploy. The README pointed agents at a nonexistent `.opencode/skills/**`; it now says `.codex/skills/**`.
- **Fixed: search results linked to headings that don't exist.**
  - Search anchors were slugged differently from the ids Astro gives headings. Four Bad People headings with curly quotes or `≠` linked nowhere.
  - Example results used nested paths that 404ed: six in Bad People, and every example in the other books.
  - The search index now uses `github-slugger`, which matches all 184 heading ids in the four books, and builds example URLs from the route slug. Pages without headings link to the page top.
- **`check:build` fails when a search result's page or heading id doesn't exist.**
- **TD-012 closed.** `rehypeBookkitHeadingIds` never ran under Astro 7's default Markdown processor. It is removed from the `astro.config.mjs` shim (which also removes the MDX deprecation warning from every build) and marked deprecated.

**Migration:** books outside this repo run `bun run sync:shims` to drop the plugin from `astro.config.mjs`. Search URLs for examples change from `/read/examples/<mechanism>/<file>` to `/read/examples/<file>`, the page's real URL.

## 2026-10-07 — `bun run verify`: the checks a change needs

- **New: `bun run verify`** (also `bookkit verify`). It reads what changed since `origin/main` (committed, staged, unstaged, and untracked files) and runs only the checks those paths need. The mapping is CONTRIBUTING's verification matrix as code, in `scripts/lib/verify-plan.ts`. For example:
  - a chapter edit validates and builds that book (about 6s);
  - an engine edit runs types, tests, shims, the architecture check, and one book's build.
- **Output is one line per check.** A failed check prints the tail of its output. `--all` runs every gate CI runs, `--list` shows the plan, `--json` prints one summary object, and `--base <ref>` changes the comparison.
- **Content checks report only findings in the files you changed,** so Crumple Zone's existing warnings don't hide a new one. An error-level finding in a changed file fails the check.
- **`check:types` covers `scripts/`**, tests included (`scripts/tsconfig.json`, `@types/bun`). It found:
  - `check:concepts` read a bare `--book` or `--mode` flag as the value `true`;
  - the governance output type import didn't resolve, so its payload was typed `any`.
- **`validate-book --json`** prints one object per finding, with a repo-relative `file` when the finding names one.
- **`bookkit status --json`** prints the per-book summary.

## 2026-10-07 — One formatting baseline, enforced

- **Every file now matches `biome.json`.** 250 files had drifted (247 of 511 didn't match before), mostly 2-space indentation from before the formatter was configured. Running the formatter or the pre-commit hook on any file used to rewrite hundreds of unrelated lines. That commit is formatting and Biome's safe fixes only, and is listed in `.git-blame-ignore-revs`.
- **Built output is unchanged** except one client chunk: Biome's import sorting reordered modules inside `qa-controller.ts`. Every page's HTML and CSS is byte-identical apart from that chunk's file hash.
- **Import sorting is off for `.astro` files.** In a page or component, import order decides the order of stylesheets, so sorting there changed the reading hub's CSS cascade.
- **Three `@ts-ignore` comments are kept on purpose,** each with a `biome-ignore` saying why. Biome's safe fix turns them into `@ts-expect-error`, which fails the type check whenever the optional dependency they guard is installed.
- **CI runs `bun run check:format` (`biome ci .`)** in place of `biome lint`. It fails on formatting, import order, or lint errors.
- **`bun install` installs the pre-commit hook** (`"prepare": "husky"`). Before, fresh clones had no hook, so lint-staged never ran and drift accumulated.

## 2026-10-07 — `bookkit` is the author's front door

- **`bun run bookkit` with no command shows where each book stands**: title, status, chapters (and how many are stubs), mechanisms, tools, and the commands to run next. Before, it printed a task-runner help screen and exited 1.
- **`bookkit new chapter <book> "<title>"`** creates the next chapter, numbered in the book's own scheme (tens or ones, padded), as a draft. It lists the book's mechanism slugs to bind. There was no chapter scaffold before.
- **`bookkit new mechanism <book> "<title>"`** checks every book first (bet B1: new chapters should bind existing mechanisms, not coin names). It refuses a slug another book already has and says how to share that file. It lists up to three mechanisms with overlapping wording and stops; `--force` creates it anyway. `--definition` adds the definition's words to the comparison.
- **`bookkit new tool|example|book`** take positional arguments (`new tool <book> <mechanism> "<name>"`) and call the existing scaffolds. `bun run new:mechanism -- --book … --slug …` and the other scripts still work.
- **`bookkit check [book] [--quick]`** runs the structure validator and then `check:corpus` in error mode, and ends with one pass/fail line for each.
- **`bookkit help`** groups commands by job: write, check, preview and publish.
- **Validator output is grouped by file.** A tool missing five fields is one line instead of five, with a repo-relative path: Crumple Zone's 51 warnings print as 11 lines.

## 2026-10-07 — What a visitor from search finds

Done at the author's request; it serves B1's outside-reader test (five people outside the project read one book end to end), which starts with a stranger landing on one page.

**Fixed**

- **Reader JavaScript did not run in production builds.** `BookLayout`, `ReadHub`, `AnalyticsDashboard`, and `NewBookStudio` loaded their client code with `?url` imports of `.ts` files, so Vite copied the raw TypeScript into `dist/_astro/` and every page threw on load. On a deployed book, Search, Menu, Ask, Shortcuts, Appearance, and heading anchors did nothing; dev mode compiled the files on request, so it looked fine there. The scripts are now processed `<script>` tags that Vite bundles.
- **Canonical URLs had a trailing slash**, as did `og:url`, `WebPage.url`, breadcrumbs, and `DefinedTerm` URLs. The host answers that form with a redirect, and the sitemap listed the other form. `canonicalPathname` / `canonicalPageUrl` (`seo/urls.ts`) now drop it everywhere.
- **The sitemap listed 17 example URLs that 404** (it used the nested file path; routes use the file name). It now builds every section from the same index the read routes use.
- **Language and version links pointed at pages a static build does not have** (`hreflang="es"`, `/es/…`, `/v/0.1.0/…`).

**New**

- **`site.runtime: "static" | "server"`** in `book.config.ts`, default `"static"`. Static pages leave out what needs a request handler: the feedback widget, the Ask panel, analytics beacons, and the language and version switchers and `hreflang` alternates. `"server"` keeps them.
- **Search titles and descriptions per page.** Titles are the page name, then the book's short title (`bookPageTitle`); 53 Running Hot and 84 Crumple Zone titles were over 60 characters with the full subtitle. Descriptions come from the chapter's new optional `summary`, a mechanism's or term's definition, a tool's `trigger`, or an example's `summary`, then the page's first paragraph (`extractPageFacts`, read from the raw MDX source), then `site.defaultMeta.description`. Before, about 80% of pages repeated the book's description. `og:site_name` is the short title, and read detail pages are `og:type` `article`.
- **Stub chapters stay out of search.** A chapter with fewer than `site.minIndexableWords` words of prose (default 60; 0 turns it off) gets `noindex, follow` and is left out of the sitemap. Today that is 5 Running Hot chapters and all 11 Crumple Zone chapters (16–40 words each); the shortest real chapters run 65 or more.
- **Author tools stay out of search.** `/read/analytics`, `/read/tools`, and `/new-book` carry `noindex, nofollow`, and robots.txt disallows them (`AUTHOR_ONLY_PATHS`).
- **Colophon on every page**: the book's title, `site.defaultMeta.description` as its pitch, and "Start reading →". It replaces the footer that repeated the title, so a reader who lands mid-book can see what the book is.
- **Toolkit pages name their mechanism** instead of showing its slug.
- **`check:build` fails on** client code shipped as raw TypeScript, sitemap URLs with no built page, canonicals that differ from their sitemap URL, and indexable author tools.
- **Read pages and `BaseLayout` are shims.** `src/layouts/BaseLayout.astro` and the chapter, mechanism, glossary, toolkit, and example detail pages were identical copies in every app that `check:shims` did not cover. They now live in `templates/book-app/` and are synced. Glossary pages in Bad People, Crumple Zone, and On-Call take Running Hot's newer version, which links to the term's mechanism.

**Migration**

- A book served with an adapter: set `site.runtime: "server"` to keep feedback, Ask, analytics, and the locale and version switchers.
- Books outside this repo: run `bun run sync:shims` to pick up the new shims. Local edits to those pages are overwritten; put book-specific copy in `src/lib/read-copy.ts` or config.
- No schema change is required. `chapterSchema` gains an optional `summary`.

## 2026-10-07 — `check:corpus` runs a stronger model, measured against the author's merges (bet B1)

- **Default model is now `nomic-ai/nomic-embed-text-v1.5`** (full precision, cutoff 0.80), replacing `Xenova/all-MiniLM-L6-v2` (cutoff 0.45). The old model missed the `human-heat-sink` / `crumple-zone` merge: it scored the pair 0.36, and 56 pairs in today's corpus scored higher. nomic ranks both recorded merges in the top two and, at 0.80, flags only one pair today, which is already ruled distinct, so `check:corpus --mode error` still passes. It runs through the same `@xenova/transformers` dependency; no new package. The first run downloads about 520 MB instead of 25 MB, and a full run takes about 10s on CPU.
- **New flag: `--model <key>`** picks a model from `EMBEDDING_MODELS` in `scripts/lib/embed-text.ts` (`nomic`, `minilm`, `bge-base`). Each model carries its own task prefix, pooling, precision, and cutoff, because similarity scales differ by model. `--threshold` still overrides the cutoff.
- **New mode: `--eval`** scores each model (or the ones named in `--model a,b`) against the author's rulings: each merge's score and how many pairs in today's corpus score higher, the top pair ruled distinct, and how many pairs it flags at its own cutoff and at the cutoff that catches every merge, split into ruled and unreviewed. The scoring is `evaluateCorpusModel` in `scripts/lib/corpus-eval.ts`.
- **`corpus.json` gains `merged`:** each merge the author made, with the date, the reason, and both mechanisms (`book`, `slug`, `title`, `definition`, `is`) as they were before it. The two merges of 2026-10-07 (`delay-as-force`, `crumple-zone`) are recorded from commit `3aa6bb3`. Normal runs ignore it.
- `corpusEmbeddingText` accepts any object with `title`, `definition`, and `is` (it took a full `MechanismRecord`); existing callers are unaffected.

**Migration:** none for books. To keep the earlier behaviour, pass `--model minilm`. A cutoff passed with `--threshold` is now read on the chosen model's scale: 0.45 means something different for nomic than for MiniLM.

## 2026-10-07 — `.astro` files are type-checked

- **`bun run check:types` now checks `.astro` files.** After the TypeScript 7 pass, it runs `astro check` on every book and on the engine, in parallel. The 116 `.astro` files (24 engine components and layouts, 92 book pages) had never been type-checked: each book had about 265 errors and the engine 109. All are fixed, and the gate fails on new ones. `-- --no-astro` skips this pass for a quick loop. About 27s locally.
- **Content modules are typed.** `BookContentModules` was `Record<string, unknown>` for every section, so pages saw untyped, possibly-undefined frontmatter. Each section is now `MDXInstance<AuthoredFrontmatter<schema>>`: the schema's input type (fields with defaults are optional, since pages read raw frontmatter) plus `locale`. The engine exports `ChapterModule`, `MechanismModule`, `ToolkitModule`, `GlossaryModule`, `ExampleModule`, and `AuthoredFrontmatter`. The `book-runtime.ts` shim passes them to `import.meta.glob`.
- **`Astro.locals` is typed.** The engine's `astro-env.d.ts` augmented a `Locals` interface Astro does not read. It now declares the global `App.Locals` (`locale`, `localePath`, `originalUrl`, `bookVersion`, `preview`). Books load it with `"types": ["astro/client", "@bookkit/astro-bookkit/env"]` in their tsconfig.
- **Bugs the check found, now fixed:**
  - A tool with a `title` and no `name` (which the schema allows) rendered as "undefined" in its page title, an empty `<h1>`, and "Untitled action" in lists. All 10 Crumple Zone tools were affected. New `toolkitDisplayName()` applies the schema's rule (`name`, else `title`) everywhere a tool is named.
  - Example pages never showed the "not yet translated" notice: they looked up `frontmatter.slug`, which examples do not have. They now use the route's slug. Glossary pages, whose `slug` is optional, do the same.
- `exampleSchema` gains an optional `summary` (the page already read it for the meta description); the unused `description` fallback is dropped.
- Engine types accept readonly locale lists (`as const` book configs), and `createBookLayoutState` takes `App.Locals`.

**Migration (books outside this repo):** add `"@bookkit/astro-bookkit/env"` to `compilerOptions.types` in the book's tsconfig, and re-sync shims (`bun run sync:shims`) so `book-runtime.ts` types its globs. Pages that read `module.frontmatter ?? {}` keep working; the fallback is no longer needed.

## 2026-10-07 — Typecheck on TypeScript 7

- **`bun run check:types` uses TypeScript 7.0.2, the native compiler.** The same five projects typecheck in about 4s instead of about 18s locally; in CI, typecheck was 26s of a 53s run. It reports the same errors as TypeScript 5 on the current tree and on planted errors.
- TypeScript 7 is the devDependency `typescript-native` (an npm alias, pinned). The `typescript` package stays on 5.x because `scripts/validate-book.ts` parses `book.config.ts` with the 5.x compiler API, which 7.x replaced. Editors keep using 5.x.
- `bun run check:types -- --tsc` runs the old TypeScript 5 check, as a fallback.
- Neither compiler reads `.astro` files (see the entry above for `astro check`).

## 2026-10-07 — Docs streamlined

- **Removed 65 files (~33k words)**, all recoverable from git at `2ca1b3e`:
  - 42 spec/PRD files: `bad-people`'s 14 copied verbatim into `running-hot` and `crumple-zone`, plus the engine's feature-spec snapshot.
  - Three identical `USER_JOURNEY_CRITIQUE.md` files.
  - Eight UI critiques and reviews from February and March.
  - Superseded planning docs: `priority-agent-features`, `prd-completion-user-stories-and-specs`, `audit-findings-consolidated`, `refactoring-targets-2026-03`, `mcp-agent-skills-research`, and the shipped and parked gap analyses for the runbook wedge and reader forking.
  - Root `UX_AUDIT.md`, `FRONTEND_INEFFICIENCIES.md`, `SCRATCHPAD.md`, and `STACK_CAPABILITIES_RESEARCH.md`.
- **README:**
  - "Headline numbers" claimed 140 tests and "two teaching books"; it is now "What's here".
  - "Commercial direction" called the runbook wedge the first product while that bet is parked; it is now "Direction", pointing to `docs/bets.md`.
  - Five sections that repeated `AGENTS.md`, `CONTRIBUTING.md`, or `CHANGELOG.md` are removed: the decision guide, the risk rule of thumb, the second compile diagram, the migration notes, and the contribution model.
  - The doc map lists the canonical set: the README, `AGENTS.md`, `CONTRIBUTING.md`, architecture, design notes, authorship model, bets, roadmap, debt register, CHANGELOG, skills, and package and book READMEs.
- **One list of canonical documents.** It now lives in `AGENTS.md`, which also lists the CHANGELOG as where migration notes go. CONTRIBUTING links to that list instead of keeping its own copy.
- **MCP governance resources:** the stale stack scan and MCP research note are replaced with `docs/architecture.md`, `docs/bets.md`, and `docs/design-notes.md`.
- **`bun run stack:capabilities`** prints its report instead of rewriting a root file.
- **Book TODO trackers:** the stale audit items are dropped (the mobile header item was done by the typography pass), Crumple Zone's file no longer says "Bad People", and `on-call` loses its item to re-review a retired doc.

## 2026-10-07 — Content: `human-heat-sink` combined into `crumple-zone` (bet B1)

- `running-hot/human-heat-sink` and `crumple-zone/crumple-zone` are one mechanism, `crumple-zone`, with an identical contract in both books. The definition and lists are merged, and the measurable predictions and tests come from Running Hot. Each book keeps its own body prose.
- `bad-people/transfer-success` stays distinct; the ruling and its reason are in `corpus.json`.
- `check:corpus --mode error` passes: 31 mechanisms, 2 shared, 0 unresolved.

**Migration (running-hot, draft):** the mechanism slug `human-heat-sink` is gone. `/read/mechanisms/human-heat-sink`, `/read/glossary/human-heat-sink`, and the example's `starter-mechanism` path no longer exist; use `crumple-zone`. The glossary entry keeps "human heat sink" as an alias. The tool keeps its slug `human-heat-sink--handle-check` (and URL) and now binds to `crumple-zone`. The scaffold-named mechanism file `starter-mechanism.mdx` is replaced by `crumple-zone.mdx`. Chapter `mechanisms:` lists and `book.config.ts` are updated.

## 2026-10-07 — Corpus overlap: `check:corpus` (bet B1)

**Highlights**

- **New CLI: `bun run check:corpus`** (`scripts/check-corpus.ts`). It runs the mechanism-overlap check across books instead of within one, reports overlapping pairs grouped into clusters, and says how many mechanisms would remain if every cluster were folded into one. Flags: `--books`, `--no-semantic`, `--threshold`, `--json`, `--export`, `--mode error`.
- **Semantic pass.** `scripts/lib/embed-text.ts` embeds each mechanism's title, definition, and `is` list with `Xenova/all-MiniLM-L6-v2` through the engine's optional `@xenova/transformers` dependency, one text per call so a mechanism's vector does not depend on what else is loaded. If the model can't load, the check says why and runs lexical-only.
- **New engine analyzer: `analyzeCorpusOverlap`** (`suggestions/corpus-overlap.ts`). Pure and deterministic: callers inject one vector per mechanism; pairs are flagged by lexical or semantic similarity, then union-found into clusters. Emits `corpus-overlap` suggestions. The lexical scorer moved into a shared `lexicalMechanismSimilarity` helper that `analyzeMechanismOverlap` now uses too (behaviour unchanged).
- **First result** over `bad-people`, `running-hot`, and `crumple-zone`: 6 clusters covering 19 of 33 mechanisms. The lexical pass alone catches 1 of the 14 overlapping pairs.
- **A slug names one mechanism across the corpus.** Books that share a mechanism each carry a copy under the same slug. `check:corpus` counts it once and reports **drift** if the copies' contracts (`title`, `definition`, `is`, `isNot`, `predictions`, `tests`, `satisfies`) differ.
- **`corpus.json`** at the repo root names the default books and records pairs the author ruled distinct, each with a reason. Ruled pairs stop being flagged, and rulings that name a slug that no longer exists are reported as stale. `--mode error` exits 1 on any cluster, drift, or stale ruling.
- **Merge pass (content):** `bad-people/coercive-waiting` is combined into `delay-as-force`, now shared by `bad-people` and `running-hot` with an identical contract. The other 13 flagged pairs are ruled distinct in `corpus.json`.
- The corpus API (`analyzeCorpusOverlap`, `corpusEmbeddingText`, `DEFAULT_SEMANTIC_OVERLAP_THRESHOLD`, and the `Corpus*` types) is exported from the package root, `@bookkit/astro-bookkit`. `analyzeCorpusOverlap` rejects vectors of mixed or zero dimension instead of comparing a shared prefix, which could report false overlap.
- Fixed: the embedding model runs single-threaded. Bun rejects onnxruntime-web's blob-URL workers (`ERR_WORKER_PATH`), which could hang `check:corpus`.

**Migration (bad-people, draft):** the mechanism slug `coercive-waiting` is gone. `/read/mechanisms/coercive-waiting`, `/read/glossary/coercive-waiting`, and the example's `coercive-waiting` path no longer exist; use `delay-as-force`. The glossary entry keeps "coercive waiting" as an alias. The tool keeps its slug `coercive-waiting--deadline-countermove` (and URL) and now binds to `delay-as-force`. Chapter `mechanisms:` lists, `book.config.ts`, and the reading-hub entry point are updated.

**Scope**: new analyzer in `suggestions/`, new script, `corpus.json`, content merge in `bad-people` and `running-hot`, README and architecture-doc lines. No schema, frame, or validator changes, and nothing runs in CI or at build time.

## 2026-10-07 — Reader typography: two voices, one ink, book order

**Highlights**

- **Fonts are now chosen and shipped.** The stylesheet named Inter and Merriweather but never loaded either, so every book rendered in whatever the reader's OS had (usually Times or Georgia). The engine now depends on `@fontsource-variable/newsreader` (Production Type, OFL, optical sizes 6–72) for the book and `@fontsource/fragment-mono` (Wei Huang, OFL) for the apparatus: navigation, breadcrumbs, mechanism contract labels, status, file sizes. `BookLayout` imports both. A typical first page view downloads about 300 KB of fonts (Newsreader roman and italic plus Fragment Mono, Latin subset), cached immutably under `/_astro/`.
- **New colour system: paper, ink, rubric.** `--color-paper`, `--color-ink`, and `--color-rubric` replace the teal accent; muted text, borders, and rules are ink mixed toward paper. `--color-accent*` now resolve to ink, so existing tinted components turn neutral. Shadows and the background gradient are gone (`--shadow-*` resolve to `none`), and hard-coded radii are tokenised as `--radius-control` / `--radius-pill` (2px).
- **Reading surfaces are unboxed.** Chapter, mechanism, hub, and index pages use hairline rules and space instead of cards, pills, and chips. Body text is 19px (18px on phones) at 1.5 leading with a ~68-character measure, old-style figures, `text-wrap: pretty`, hanging punctuation, hung en-dash list markers, and hyphenation on phones.
- **Header becomes a running head.** It shows the short title (text before the first colon) in italic, with the full title in `title`. The version badge is hidden when the reader is on the latest version. `⌘K` is hidden on touch devices. On phones the header is one line and navigation lives only in the bottom bar, which is now a flat full-width strip.
- **Fixed: the Menu was unreachable on desktop.** Release notes, Version and language, Appearance, Ask, and Shortcuts sat in an overflow panel that stayed `hidden` at ≥721px while its toggle was `display: none`. The Menu toggle now shows at every width and opens a dropdown on desktop and a sheet on phones.
- **Fixed: chapters were in alphabetical order.** Chapter prev/next links sorted by slug, and `ContentIndexList` auto-grouped any list over 10 items by first letter, so `running-hot` and `crumple-zone` listed chapters A–Z. Chapter pages now follow `order` when set, else the numbered file order; chapter indexes pass `alphaMode={false}`.
- **New skill: `.codex/skills/reader-typography/SKILL.md`**, exposed as an MCP governance resource. `.claude/skills` is a symlink to `.codex/skills` so Claude Code sessions load the repo's lane skills too.

**Scope**: engine (`styles/`, `components/read-hub/`, `layouts/`, `mcp/governance.ts`), identical edits to `read/chapters/[slug].astro` and `read/chapters/index.astro` in all four books, typographic punctuation in four content titles. No schema, frame, or validator changes.

## 2026-10-05 — Reader UX pass: mobile menu, dark-mode tokens, list filters

**Highlights**

- **Fixed: the header Menu was invisible on phones.** A leftover `.site-nav__overflow { display: none }` from the old `<details>`-based menu (plus dead `[open]` selectors) overrode the bottom-sheet drawer rule, which never re-declared `display` — so on viewports ≤720px the Menu toggle flipped `aria-expanded` but nothing appeared, leaving Release notes, Version/Language, Appearance, Ask, and Shortcuts unreachable. The drawer now carries an explicit `display: grid`; the conflicting and dead rules are gone. Both entry points verified (header toggle and the mobile CTA bar), plus Escape/outside-click close.
- **Fixed: dark mode rendered with hardcoded light colors.** New semantic tokens (`--color-success/-strong`, `--color-danger/-strong`, `--color-warning/-strong`, light + dark variants) replace raw hex/rgba values in: `.list-link` borders (were invisible on dark: `rgba(17,24,39,…)` on every glossary/chapters/mechanisms/toolkit list), `.preview-empty`, `.preview-badge`/`.preview-notice` (amber), `.preview-status--active/expired/revoked`, `.release-chip--new`/`.version-card__chip--new` (green), `.read-meta-chip` variants, `.hero-quick-links .pill`, `.list-density-toggle__button`, `.breadcrumb`, `.mobile-cta`, the New Book studio progress bar, and the skip-link outline. Translucent surfaces now use `color-mix` over `--color-surface` so they adapt to both themes.
- **New engine capability: quick-filter pills on `ContentIndexList`.** The mechanisms index pages shipped ~200 lines of copy-pasted pill markup, script, and CSS in three book apps (with hardcoded colors that broke dark mode). `ContentIndexList` now accepts `quickFilters: { value, label }[]` (plus label overrides), renders tokenized pills, forces the filter input visible when pills are present, and wires pill/clear state through `aria-pressed`. App pages keep only their book-specific tag data; `bad-people`, `on-call`, and `crumple-zone` dropped their duplicated `<script>`/`<style>` blocks (265 → 102 lines for `bad-people`).
- **Simplified: mobile meta clamping is CSS-only.** The per-book "Show more" JS toggle for long list meta is replaced by a two-line `-webkit-line-clamp` on `≤720px` for all list pages; the full text stays one tap away on the item page.
- **Improved: chapter mechanism pills show titles.** Chapter pages rendered raw slugs (`coercive-waiting`); they now resolve each linked mechanism's localized title (slug remains the fallback).
- **Standardized: chapter-page layout moved into the engine.** The four identical per-app `<style>` blocks (incl. a dead `.site-main > h1` rule) and the inline `style=""` on the mechanisms row are replaced by engine classes (`.chapter-mechanisms`, `.chapter-mechanisms__label`, `.chapter-content`, `.next-steps__branches`) and a `.site-main:has(.chapter-shell)` width rule; chapter pages are style-free and byte-identical across books.
- **Removed dead code:** `ReaderUtilityStrip.astro` and `ConceptPopover.astro` (zero usages) and their CSS; the duplicated mobile `.site-nav__more-toggle` block.

**Scope**: engine (`styles/`, `components/`), app-local read pages (`mechanisms/index.astro` in three books, `chapters/[slug].astro` in all four). No schema, frame, or validator changes. `create-bookkit` picks the new pages up automatically (it copies `apps/bad-people`).

**Behavior notes**: pill active state is now carried by `aria-pressed` instead of an `is-active` class; the mechanisms-page tail section is styled by the engine's `.index-tail` instead of per-page CSS; list links use a uniform `--color-border` outline instead of the two-tone bottom border.

## 2026-09-14 — Public deployment readiness (TD-011)

**Highlights**

- **Fixed: static builds locked every visitor out.** Astro runs middleware while prerendering, so a book with `previewAccess.enabled` and no active token rendered its 401 "preview required" page into every file in `dist/` — pages, sitemap, PDF, and EPUB alike. `apps/on-call` (status `published`, token expired 2026-06-30) and `apps/bad-people` shipped 100% lockout output; CI never ran the build, so nothing noticed. `createPreviewAccessMiddleware` now passes prerendered routes through (`context.isPrerendered`) and warns once per build that the gate is not enforceable on static output. `apps/on-call` has `previewAccess` disabled and its dead token removed.
- **Fixed: PDF export crashed on `→`.** pdf-lib's standard fonts are WinAnsi-only; one arrow in chapter prose aborted the whole export (masked until now by the lockout). `toWinAnsiText` transliterates arrows, comparison symbols, and check marks, keeps base letters for unsupported diacritics, drops emoji, and marks anything else with `?`.
- **Fixed: preview tokens were published in built HTML.** `/read/analytics` rendered every tokenized preview link into a public page. `PreviewLinksPanel` gains `revealLinks`; the dashboard passes `import.meta.env.DEV`, so built pages show only the token hint.
- **Fixed: `apps/crumple-zone` used `bad-people.book` as its `site`**, so its sitemap and OG URLs pointed at another book. `astro.config.mjs` now reads `site` from `book.config.ts` and is a shim held identical across books by `check:shims`.
- **New gate: `bun run check:build`** (`scripts/check-build.ts`, `scripts/lib/build-output.ts`) verifies each `dist/`: no lockout pages, real `%PDF`/`PK` export bytes, `404.html` and SEO artifacts present, one host across canonical/robots/sitemap, and no `noindex` on a `published` book. CI now runs `build:all` then `check:build`.
- **New: Cloudflare deployment.** Per-app `wrangler.jsonc` (Workers static assets, `404-page`, `drop-trailing-slash` to match Astro's canonical URLs), `public/_headers` (nosniff, frame, referrer, permissions policies; immutable caching for `/_astro/*`; `noindex` on `*.workers.dev`), a `404.astro` shim, `bun run bookkit deploy [book] [--dry-run] [--no-build]` (build → `check:build` → `wrangler deploy`), and root `qa` / `deploy` scripts that `.opencode/modes/deploy.md` had referenced but which did not exist. `create-bookkit` projects get the same files.
- `bun run new:book` no longer copies the template book's `dist/`, `node_modules/`, or `.astro/`.
- Removed the empty `packages/astro-bookkit/src/compiler/` placeholder that `check:architecture` warned about on every run.

**Scope**: engine (`preview/`, `exports/`, `components/`, `styles/`), app shims, scripts, CI, docs. No schema, frame, or validator changes. Existing books are unaffected apart from `apps/on-call`'s `previewAccess` block and the corrected `crumple-zone` site URL.

## 2026-09-14 — Review-cadence enforcement (TD-008)

**Highlights**

- `deriveReviewCadence` computes each runbook tool's next review due date from the latest release narrative (`date` + `reviewEveryDays`); `auditReviewCadence` emits one warning per overdue procedure.
- `deriveComplianceMatrix` accepts an optional `{ releases, asOf }` third argument and annotates rows with the earliest due date plus a `reviewOverdue` flag; rows stay unannotated when releases are omitted (back-compat).
- `check:runbooks` prints the review annotations on compliance rows and includes `nextReviewDue`/`reviewOverdue` in the exported artifact.
- `docs/tech-debt-register.md`: TD-008 closed; Track 5 recorded as shipped 2026-09-04 in `docs/commercial-roadmap.md`.

## 2026-09-07 — Architecture documentation becomes a gate

**Highlights**
- New canonical document `docs/architecture.md`: three-layer model, the two pipelines (Astro render vs. Bun governance CLI), the full engine module map with import tiers, the content-section contract, and extension points. Replaces the stale repo-layout tree in `README.md`, which listed 9 of the engine's 26 modules.
- New gate `bun run check:architecture` (`scripts/check-architecture.ts`, `--json` supported), added to CI. It verifies the document against the tree: every engine module is mapped and every mapped module exists; imports point strictly down a tier; the declared import cycles are exactly the cycles that exist; and workspace paths and content sections match disk. Machine-checked regions are delimited by `<!-- architecture:*:start -->` markers.
- **New invariant, now enforced**: engine modules are tiered, and a module may only import from a strictly lower tier. Same-tier imports are legal only inside a declared cycle. Two cycles are declared and tolerated — `frames` ↔ `validators` and `book` ↔ `components` ↔ `layouts`; any new cycle fails CI.
- `packages/astro-bookkit/src/README.md` reduced to a pointer; it had drifted to 6 modules and described the empty `compiler/` directory as owning compile/ordering/export logic that actually lives in `book/` and `exports/`.

**Scope**: documentation + one new CI gate. No engine, schema, frame, or validator behavior changes. Known warning: `packages/astro-bookkit/src/compiler/` is an empty placeholder the gate reports on every run until it is removed or implemented.

## 2026-09-07 — Proposal pipeline (`bookkit propose`)

**Highlights**
- New engine module `packages/astro-bookkit/src/proposals/`: composes a reviewable **proposal bundle** from a book's current content — frame detection (runbook vs intervention from keyword signals), mechanism drafts for unregistered recurring concepts, missing prerequisite edges, toolkit bindings for uncovered/proposed mechanisms, and a `book.config.ts` draft.
- New CLI `bun run bookkit propose <book>`: prints the bundle, writes artifacts with `--write` to `apps/<book>/proposals/`, and materializes approved proposals with `--apply mechanisms --apply tools --apply config`. Materialization refuses to overwrite or redefine registered slugs; the live `book.config.ts` stays author-gated. `--detect-frame` evaluates content independent of the declared frame; `--id <proposal>` accepts a specific proposal.
- Shared book-content loader extracted to `scripts/lib/load-book.ts`; `check:suggestions` now consumes it (behavior unchanged).

**Scope**: new engine capability + CLI. No schema, frame, or validator changes — existing books unaffected.

## 2026-09-05 — create-bookkit generator, compliance artifact, frontmatter fidelity

**Highlights**
- New `packages/create-bookkit/` generator (`bun run create-bookkit <dir> --book <slug>`): scaffolds a standalone book project with the engine vendored inline (works offline, no publish required). App surface, config, and checker scripts (`validate`, `suggest`, `runbooks`, `import`) are wired and verified end-to-end against an installed, built, and validated project.
- `bun run check:runbooks --export <file.json>` writes the compliance matrix as a machine-readable artifact (book, generatedAt, covered/total, rows).
- Engine fix in `parseSimpleFrontmatter` (`validateBookInMemory` / MCP `validate_book`): YAML list frontmatter (`is:`, `steps:`, …) is now parsed as arrays and numeric scalars as numbers, so the deterministic verify tool no longer flags valid list-bearing content as schema-invalid. New test coverage in `validators/book-validator.test.ts`.

## 2026-09-04 — Runbook wedge (engine + schemas + proof book)

**Highlights**
- New `runbook` frame: required steps `ownership`, `trigger`, `steps`, `escalation`, `verification`.
- Frame enforcement is now config-driven: the overview chapter is validated against the frame declared in `book.config.ts` (`extractFrameConfigFromSource`), falling back to the intervention frame when none is declared. Runbook books are no longer checked against the intervention frame.

**Backward-compatible schema extensions (all optional with defaults)**
- `toolkitSchema`: `owner`, `reviewEveryDays`, `drills`, `escalation {to, when, withinHours?}`, `satisfies`, `runbookSteps [{when?, action}]`.
- `mechanismSchema`: `satisfies`.
- Existing books are unaffected.

**New surfaces**
- `packages/astro-bookkit/src/suggestions/runbook-coverage.ts`: `auditRunbookCoverage`, `deriveComplianceMatrix`, `summarizeCompliance`, `auditReleaseControlDrift`.
- `scripts/check-runbooks.ts` (`bun run check:runbooks`): audits runbook coverage, derives the compliance matrix, and joins release narratives against HEAD coverage.
- Proof book `apps/on-call/`: 4 control mechanisms, 4 drilled toolkit primitives, runbook-framed chapters, examples, glossary, release.

**Docs**
- `docs/design-notes.md` (invariant rationale), `docs/sop-wedge-gap-analysis.md` (plan + status), README migration notes.

## Prior work (summarized)

- **AI suggestion layer**: deterministic analyzers for mechanism overlap, concept triage (+ candidate mechanism drafts), example-swap auditing, prerequisite edges, and reading-order QA grounding. Ships as `bun run check:suggestions`.
- **MCP tooling**: `bookkit.*` MCP tools incl. `validate_book`, `list_books`, `export_book`, `compile_book`.
- **Recompilable-books core**: engine/author/content separation, Zod schemas, frame validators, graph-based ordering, PDF/EPUB exports, shim enforcement.