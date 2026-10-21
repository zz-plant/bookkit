# Bookkit

<p align="center">
  <a href="https://github.com/zz-plant/bookkit/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/zz-plant/bookkit/ci.yml?branch=main&style=flat-square&label=tests" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-CC0--1.0-informational?style=flat-square" alt="License: CC0-1.0"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-1.3.14-black?style=flat-square&logo=bun&logoColor=white" alt="Bun 1.3.14"></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/on-call-pages-dark.png">
  <img src="docs/assets/on-call-pages-light.png" width="880" alt="Left: the Incident Triage mechanism page, with its definition, scope, and boundaries. Right: the Classify severity tool page, 10 minutes, for Incident Triage, with four numbered steps.">
</picture>

<sub>Two pages of the On-Call Runbook as Bookkit builds it: the Incident Triage mechanism, and the 10-minute tool that applies it.</sub>

Bookkit compiles a nonfiction book, written as MDX files, into a website with search, a PDF, an EPUB, and an MCP endpoint for AI agents. Each file is a typed record (a chapter, a mechanism, an action, an example, or a glossary entry), and Bookkit checks every record against its contract before it builds or publishes the book.

It is a set of command-line tools in a [Bun](https://bun.sh) workspace, built on [Astro](https://astro.build). There is no editor and no CMS: you edit files, run `bun run bookkit`, and commit with git.

> **AI may propose; the compiler decides.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bookkit-check-dark.svg">
  <img src="docs/assets/bookkit-check-light.svg" width="880" alt="Terminal: grep shows a tool file that sets mechanism: root-cause-analysis and timeboxMinutes: 45. bun run bookkit check reports two errors, a timebox over 10 minutes and an unknown mechanism, each with a fix, and exits with code 1.">
</picture>

<sub>Real output of `bun run bookkit check` on a toolkit action broken on purpose: a 45-minute timebox, and a mechanism the On-Call Runbook doesn't define. `bun run verify`, which CI runs, fails on the same two errors.</sub>

## Who it is for

Bookkit fits a book that names the causes behind a problem and gives the reader an action for each one: an incident runbook, an operating procedure, a field guide, or an argument for change that ends in concrete remedies. Its contracts are built for that shape:

- every action takes 10 minutes or less (`timeboxMinutes` over 10 is an error, and the limit is not configurable);
- every action applies a mechanism the book defines;
- the book declares a frame, and its overview chapter is checked for a heading per frame step.

It is the wrong tool for fiction, memoir, essays, or narrative history. Those books have no mechanisms or 10-minute actions for the checks to hold them to, and the reader site is organized around both.

It is also not a documentation-site generator or a blog engine: the site is built from the record types below, not from free-form pages.

Using it requires a terminal, git, and Markdown. You work in a text editor; nothing is edited in the browser.

## Terms

| Term | What it is | Where it lives |
| --- | --- | --- |
| **Book** | One app: the author's decisions, the content, and the pages every book shares. | `apps/<slug>/` |
| **Book config** | The author's decisions: title, status, frame, objectives, the book's causal claim, site URL, page copy. Typed by `BookConfig`. | `apps/<slug>/src/book.config.ts` |
| **Chapter** | Prose, in reading order (file order, or `order:`). Its frontmatter lists the mechanisms it uses and the chapters to read first (`prerequisites:`). | `src/content/book/chapters/NN-<slug>.mdx` |
| **Mechanism** | A named cause the book argues for: a one-sentence definition, what it is and is not, predictions, and tests. Its slug is a durable identifier; changing what it means is a breaking change. | `src/content/book/mechanisms/<slug>.mdx` |
| **Toolkit action** (also: action primitive, tool) | Steps a reader can carry out in 10 minutes or less to act on one mechanism: a trigger, the steps, what failure looks like, and the legitimate demand it unlocks. | `src/content/book/toolkit/<slug>.mdx` |
| **Frame** | The book's shape, chosen with `frame.slug`; the four frames are listed below. | `book.config.ts` |
| **Example** | A case that shows one mechanism in one setting (`domain`). Replacing it must not change what the mechanism means. | `src/content/book/examples/<mechanism>/<slug>.mdx` |
| **Glossary entry** | A term readers meet, optionally listing the mechanisms it names. | `src/content/book/glossary/<slug>.mdx` |
| **Release note** | A version, a date, and what changed. The release notes page, the RSS feed, and the exports' metadata read it. | `src/content/book/releases/<date>-<slug>.mdx` |

The frames and the steps each one requires:

| `frame.slug` | Required steps in `chapters/00-overview.mdx` |
| --- | --- |
| `intervention` (default) | recognition, exoneration, mechanism, agency |
| `explainer` | definition, example, implication |
| `field-guide` | steps, failure-modes, checklist |
| `runbook` | ownership, trigger, steps, escalation, verification |

A step counts when a heading (levels 1 to 4) begins with its name, hyphens included: `## Recognition`, `## Failure-modes`. A missing step is a warning. In a runbook book every action also needs `escalation` and `runbookSteps` (a warning in a draft, an error once published), and `bun run check:runbooks` derives the book's control coverage matrix.

### Status

The book's `status` in `book.config.ts` decides which rules apply and whether search engines may index the book.

| Book status | Checks | Search engines |
| --- | --- | --- |
| `draft`, or no status | Draft records are allowed. Broken links, unknown prerequisites, and unsafe links are warnings. | Every page is `noindex`, `robots.txt` disallows everything, and the sitemap is empty. |
| `in-review` | As for `draft`, except that a book with no chapters is an error (`BOOK_EMPTY`). | As for `draft`. |
| `published`, `stable` | Release rules: a draft record is an error (`DRAFT_IN_RELEASE`), as are broken links, unknown prerequisites, unsafe links, missing runbook fields, and a book with no chapters. `site.url` must be a public address and `site.indexable` must not be `false`. | Indexable. |

Every chapter, mechanism, action, example, and glossary entry has its own `status` with the same four values (default `draft`). A draft record is still built and shown: chapter pages label any status other than published. A record marked `published` or `stable` is held to release rules even in a draft book.

Errors exit 1 whatever the status; `bun run validate:release` is an alias of `bun run validate`.

## How a book compiles

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-a-book-compiles-dark.svg">
  <img src="docs/assets/how-a-book-compiles-light.svg" width="880" alt="Diagram. Intent (book.config.ts) and content (src/content/book/) from the author, and proposals from agents and analyzers, all stop at one line: the compiler gates, which are contract, separation, corpus, and build. What passes becomes the read UI, PDF and EPUB, the MCP endpoint, and a coverage matrix for runbook books.">
</picture>

1. **The author decides intent** in `book.config.ts`: the objectives, the frame, and the book's causal claim.
2. **Content binds to that intent** in `src/content/book/`. A chapter names the mechanisms it uses; an action names its mechanism.
3. **The checks gate every change**: each file against its contract, content kept free of code (`check:separation`), one meaning per mechanism across books (`check:corpus`), and a build whose `dist/` passes `check:build`. `bun run verify` runs the checks a change needs.
4. **Analyzers, agents, and judges propose; the author accepts.** Nothing they write skips a check ([Proposals and AI](#proposals-and-ai)).
5. **The build emits** the reader site, the PDF and EPUB, the MCP endpoint, and, for a runbook book, the coverage matrix.

## Prerequisites

- **Bun 1.3.14**, the version `package.json` pins. With [mise](https://mise.jdx.dev), `bun run setup` (`mise trust && bun install`) installs it from `mise.toml`.
- **Node.js 22.12 or later**, which Astro 7 needs.
- **git.** `bookkit deploy` publishes from a commit, and `check:types` lists files with git, so a new project needs `git init` and a first commit before `verify`.
- **To publish:** a Cloudflare account, and `bunx wrangler login` once (or `CLOUDFLARE_API_TOKEN` in the environment).
- **Optional:** Playwright's Chromium for the accessibility and browser checks (`bunx playwright install chromium`), and about 550 MB of disk for the embedding model that compares mechanisms by meaning. Bookkit asks before it downloads the model.

## Start here

Pick one of three ways to start a book. Each ends with a book that builds; the starter text in it is yours to replace.

### 1. A project of your own

`create-bookkit` makes a standalone project with one book, a copy of the engine, and the CLI. Neither `create-bookkit` nor the engine is published to npm, so it runs from a clone:

```sh
git clone https://github.com/zz-plant/bookkit.git
cd bookkit && bun install
bun run create-bookkit ../my-book --title "My Book"    # the folder must be outside the clone
cd ../my-book && bun install
git init && git add -A && git commit -m "First draft"   # verify and deploy read git
bun run verify -- --all                                 # types, content, shared pages, and a checked build
bun run dev                                             # preview at http://localhost:4321
```

`--book <slug>` sets the slug (default: the folder name) and `--dir <folder>` imports a folder of notes as the first chapters. To take a newer engine later, pull the clone and run `bun run create-bookkit ../my-book --upgrade`. It replaces only what the engine owns (`packages/astro-bookkit/`, the scripts listed in `bookkit.json`, the shared pages, `tsconfig.base.json`, `bun.lock`, and the package entries it manages), lists what it changed, and never writes content or `book.config.ts`. A shared page you had edited is saved beside it as `_<name>.before-upgrade`. See [`packages/create-bookkit/README.md`](./packages/create-bookkit/README.md) for the project layout.

### 2. A book in this repository

In a clone, after `bun install`:

```sh
bun run bookkit new book my-book --title "My Book"     # --frame runbook|explainer|field-guide
bun run bookkit dev my-book
```

The book starts from the engine's starter (`packages/astro-bookkit/templates/starter/`): one placeholder chapter, mechanism, action, example, glossary entry, and release note, all drafts, in a `draft` book. `new book` formats the files, runs `bun install`, and makes the book the current one; commit the `bun.lock` change with it. `--skip-starter-content` leaves the content folders empty, and `--no-install` skips the install. `bun run new:book -- --book <slug>` is the same scaffold without the import option.

To delete a book app, `bun run remove:book -- --book <slug>` shows what it would delete and asks you to type the name. `--dry-run` deletes nothing, `--yes` skips the question for scripts, and `--force` allows uncommitted changes in the book.

### 3. From a folder of notes

```sh
bun run bookkit try ~/notes                              # what the folder would become; writes nothing
bun run bookkit new book my-book --from ~/notes          # a new book whose chapters are the notes
bun run bookkit import my-book --dir ~/notes --dry-run   # or into an existing book: the plan first
bun run bookkit import my-book --dir ~/notes
```

`try` names the frame the notes read as, how many documents carry each of its steps, the ideas that recur across documents, and the links and markup import would change. Import writes chapters only; mechanisms, actions, and glossary entries stay yours to define, and `bun run bookkit propose my-book` drafts them from the ideas that recur. What import does to each note is under [Import](#import).

### Then replace the starter text

The checks name every placeholder still in `book.config.ts`: the three `objectives`, `frame.intent`, and `causalStance`. Each is a warning in a draft and an error once the book is published. Set `site.url` to the address the book will have, write the chapters, and set `status: "published"` when the book should be found.

## Daily commands

`bun run bookkit` with no command lists your books with their chapters, stubs, mechanisms, and actions, then the commands to write, check, preview, build, and deploy the current one. `bun run bookkit help` lists every command. At a terminal, a command missing an argument asks for it, and a mistyped command, book, or mechanism gets the closest match. Commands run from any folder inside the workspace.

### Write

```sh
bun run bookkit use my-book                             # later commands default to this book
bun run bookkit new                                     # asks what to start, then anything it needs
bun run bookkit new chapter "Repair has a clock"        # the next chapter, as a draft
bun run bookkit new chapter "Who holds the lever" --after <chapter-slug>
bun run bookkit new mechanism "Waiting as leverage" --definition "<one sentence>"
bun run bookkit new tool waiting-as-leverage "Name the deadline"
bun run bookkit new example waiting-as-leverage Housing "The repair queue"
bun run bookkit new release "Second draft"              # releases/<date>-second-draft.mdx, next minor version
bun run bookkit rename chapter <slug> <new-slug>        # slug, file, other chapters' prerequisites, and links
bun run bookkit contract mechanism                      # the fields a section needs, and what to write in them
```

`new chapter --after` renumbers the files after the one named when there is no gap. `new mechanism` first looks for a mechanism in any book that covers the same idea and lists it; at a terminal it asks before creating one anyway (`--force` skips the question). `rename chapter --dry-run` lists the changes without writing them.

### Check

```sh
bun run bookkit check                    # the current book: errors, overlap with other books, suggestions
bun run bookkit check --all              # every book
bun run bookkit check <file.mdx>         # one file, each finding with its field and a fix
bun run bookkit check ./runbooks --frame runbook   # any Markdown folder, without making it a book
bun run verify                           # the checks your change needs, chosen from the files it touches
```

`bookkit check <book>` runs three passes. Validation reports errors (which exit 1) and warnings. The corpus check compares the book's mechanisms with other books' (by meaning when the embedding model is present; `--quick` compares wording only) and fails while an overlap is unresolved. Suggestions report mechanisms named in prose but not bound, mechanisms no chapter lists, and recurring terms that may be ideas worth naming; they never fail the check. `bookkit check` on a folder exits 1 on a broken contract file and, with `--frame`, on a missing frame step, so a runbook repository can be gated in its own CI. [What the checks enforce](#what-the-checks-enforce) lists the rules.

`bun run verify -- --all` runs every gate: formatting and lint, types, tests, content, shared pages, the architecture map, and a build of every book followed by `check:build`. CI runs it on every push and pull request to `main`. `--list` shows the plan, and `--json` prints the results for an agent.

### Preview

```sh
bun run bookkit dev                      # the current book at http://localhost:4321, with live reload
bun run bookkit dev my-book --port 4400
```

`bookkit dev` runs in the foreground until Ctrl-C (exit 130) or SIGTERM (exit 143). A port in use is reported instead of moving to another. `bun run bookkit dev stop|status|logs [book]` finds a server that `bookkit dev` runs in another terminal, or that `astro dev` left in the background.

### Build and export

```sh
bun run bookkit build                    # apps/<book>/dist: the site, exports/book.pdf, exports/book.epub
bun run bookkit export                   # a GitBook folder in apps/<book>/exports/gitbook
```

`bookkit build` builds a book with content errors too; `bookkit deploy` is the command that refuses them. [Exports](#exports) covers what the PDF, EPUB, and GitBook folder contain.

### Publish

```sh
bun run bookkit deploy my-book --dry-run   # every check deploy runs, and wrangler's dry run; publishes nothing
bun run bookkit deploy my-book --no-build  # publish exactly what that dry run built and checked
bun run bookkit deploy my-book             # check, build, and publish
```

[Deploy](#deploy) covers what deploy checks and how to publish from CI.

## Book configuration

`apps/<book>/src/book.config.ts` exports `bookConfig`, typed `as const satisfies BookConfig`; each field is documented on the type in [`packages/astro-bookkit/src/book/config.ts`](./packages/astro-bookkit/src/book/config.ts). The fields an author sets most:

| Field | Effect |
| --- | --- |
| `status` | `draft`, `in-review`, `published`, or `stable`; see [Status](#status). |
| `frame.slug`, `frame.intent` | The frame, and what the book moves the reader through. |
| `objectives`, `causalStance` | Who the reader is at the start and the end, and the book's causal claim. Both show on the "About this book" page (`/read/overview`). |
| `author: { name, url? }` | The byline on the home page and in each page's colophon. |
| `site.url` | The published address: canonical links, the sitemap, `robots.txt`, and the exports' links use it. |
| `site.indexable` | `false` keeps a published book out of search engines and fails the release check. |
| `site.minIndexableWords` | Chapters with less prose than this (default 60; `0` turns it off) stay readable but are `noindex` and left out of the sitemap and search. |
| `site.runtime` | `"static"` (default) or `"server"`; see [Server runtime](#server-runtime). |
| `home` | The home page's `kicker` and its mechanisms card (`mechanismsCard: { title, description }`). |
| `readHub` | The reading hub's `lede` and its "Where to start" cards (`quickStartCards: [{ title, description, href, recommended?, funnelStep?, eyebrow? }]`). Leave the cards out for the defaults: About this book, the chapters in order, and "Start with chapter 1: <title>". |
| `mechanismsIndex` | The mechanisms index's `lede`, and an `urgency` per mechanism slug (`urgent`, `high-leverage`, or `stabilize`) that orders the list and adds filters. A slug that names no mechanism is a warning in a draft and an error once published. |
| `relatedBooks` | `[{ title, href, description? }]`, listed as "Other books" on the home page. |
| `exports.pdf` | `false` publishes without a PDF. |
| `exports.pdfFont` | A TTF or OTF file, relative to `apps/<book>/`, for scripts the bundled fonts lack, such as CJK. |
| `previewAccess` | Token-gated previews. Static builds cannot honor it: `check:build` fails a static build that enables it. |
| `features.aiQa` | `false` turns off the reader's Ask panel, which otherwise appears on a server runtime; see [What readers get](#what-readers-get). |
| `reviewsAsOf` | For a runbook book whose content is an example: the date `check:runbooks` judges review cadence on, instead of today. |

The home page, reading hub, and mechanisms index are shared pages, so their copy lives in these fields rather than in the page files.

## What the checks enforce

`bun run bookkit check` and `bun run validate` (every book) apply each section's contract. `bun run bookkit check <file.mdx>` explains a single file, and `bun run bookkit contract [section] [--json]` prints what each field needs. The rules that most often surprise an author:

- **Required fields.** A mechanism needs a `slug` and `title`, an action a `slug`, a `mechanism`, and a name, and a chapter a `slug` and `title`; without them the file is an error. A missing definition, boundaries, steps, or trigger is a warning. A field written at the wrong level, where the build would ignore it, is an error (`FIELD_MISPLACED`).
- **Bindings.** An action, chapter, or example naming a mechanism the book does not define is an error, with the closest slug suggested. An invalid or duplicate slug is an error.
- **Reading order.** A prerequisite that comes after its chapter in reading order is a warning (`PREREQUISITE_ORDER`), as is a release note the release page cannot list (no version or date, or a date that is not YYYY-MM-DD).
- **Links.** An address is allowed when it has no scheme (a page of the book, an anchor, a relative path) or uses `http`, `https`, `mailto`, `tel`, or `ftp`. Any other, such as `javascript:`, `vbscript:`, `data:`, or `file:`, is `UNSAFE_LINK` (an error in published content, a warning in a draft), in a Markdown link and in an `href`, `xlink:href`, `formaction`, `<iframe src>`, or quote `cite`. The site keeps the link's words and drops the address; an `<iframe>` without a safe `src` is left out. A link that opens a new window gets `rel="noopener"`.
- **Raw HTML.** Content may use the elements Markdown writes, the presentational ones import keeps (`<kbd>`, `<details>`, `<sup>`, `<span>`, tables, …), and an `<iframe>` with a safe `src`; the list is `packages/astro-bookkit/src/utils/html-allowlist.ts`. Each element keeps the global attributes (`id`, `class`, `title`, `lang`, `dir`, `role`, `aria-*`) and its own (`href` on `<a>`, `src` and `alt` on `<img>`, `colspan` on `<td>`, …). `<script>`, `<style>`, `<meta>`, `<link>`, `<base>`, `<template>`, `<noscript>`, and `<title>` are left out with what they hold, and any other element (a form, a button, an `<svg>`, a `<video>`) is left out keeping its contents. Event handlers, `style`, `data-*`, `srcdoc`, `set:html`, and unlisted attributes are removed. Each is `UNSAFE_HTML`, an error in published content and a warning in a draft, with the line, what goes, why, and the fix.
- **Code in MDX.** An expression that is not a comment or a plain literal, a spread (`{...props}`), and an `import`/`export` block are removed, because the build would run them unchecked; components keep only plain props. These are `UNSAFE_HTML` too.
- **Content is data.** Content files may not import modules or contain `<script>` or `<style>` (`check:separation`).
- **Glossary links (advice).** Validation lists, as INFO, each chapter's first use of a glossary term that is not a link, with file and line. It never fails a check; `validate-book --json` reports it under `info`.

`bun run check:build` inspects each built `dist/`, and deploy and CI run it after every build:

- the home page, 404 page, `robots.txt`, sitemap, search index, release-notes feed, and `exports/book.epub` exist, and `exports/book.pdf` unless `exports.pdf` is `false`;
- no page rendered as a preview lockout, and preview access refused on a static build;
- a published or stable book is indexable; any other book is `noindex`; any book but a draft has at least one chapter page;
- canonical links, `robots.txt`, and the sitemap name one host; every sitemap URL is a built page whose canonical is that URL, and every search result lands on a built page and heading;
- author tools (`/read/analytics`, `/read/tools`, `/new-book`) are `noindex`;
- every page's link-preview image exists (an SVG-only image is a warning); no client code ships as raw TypeScript; every `.json` file parses;
- every PDF and EPUB in `dist/exports/` passes the engine's structural checks: no PDF link points at a destination the PDF lacks, no export link uses a scheme the link rule refuses, and no EPUB page holds an element or attribute the allowlist refuses.

`bun run check:runbooks [--book <slug>]` audits a runbook book's controls (mechanism, action, drill, escalation, owner), prints its compliance matrix, and flags drift between release notes and the current coverage. `--mode error` fails on an overdue review, an undrilled control, or a control with no action.

### Accessibility

`bun run check:a11y` builds every book and runs axe-core over each page type and the open panels, in light and dark, at desktop and phone widths. It fails on a serious or critical violation. `bun run test:browser` drives search and the reading keys by keyboard. Both need Playwright's Chromium once (`bunx playwright install chromium`), and CI runs both in its `accessibility` job.

## Proposals and AI

Three things can propose changes to a book, and none can bypass a check:

- **Analyzers.** `bun run check:suggestions [book]` lists overlapping mechanisms, recurring terms that are not registered (each with its count, files, and an example sentence), examples that restate a mechanism, and missing prerequisite edges. `bun run bookkit propose [book]` turns them into a proposal bundle: a frame reading, mechanism drafts, prerequisite edges, starter actions, and a `book.config.ts` draft. Both are deterministic (no model, no network) and write nothing until you ask.
- **Agents**, through the [MCP endpoint](#mcp): `bookkit.check_content` compiles a candidate file without writing it, and the same checks decide.
- **Judges**, an LLM or a person asked blind whether two mechanisms are one idea; see [Several books](#several-books-one-meaning-per-mechanism).

```sh
bun run bookkit propose my-book                       # review the bundle
bun run bookkit propose my-book --write               # also save it to apps/my-book/proposals/
bun run bookkit propose my-book --apply mechanisms --apply edges   # or --apply all
```

`--apply` writes drafts into the content tree: `mechanisms/`, `toolkit/`, and chapters' `prerequisites:`. A mechanism draft has its name, `status: draft`, and the evidence, and leaves the definition, `is`, and `isNot` to you; a starter action is `<mechanism>--starter-tool`. It never overwrites a registered record, keeps the reading graph acyclic (an edge that would close a loop is skipped and named), and writes a config draft to `proposals/book.config.draft.ts`, never to the live `book.config.ts`. `--id <proposal>` keeps one proposal, and `--detect-frame` reports what the text implies even when the book declares a frame.

### Model downloads

Comparing mechanisms by meaning uses `nomic-ai/nomic-embed-text-v1.5`, about 550 MB, through the optional `@xenova/transformers` dependency. It is downloaded once, and only with consent:

- at a terminal, `bookkit check`, `bookkit similar --semantic`, and `check:corpus` ask first;
- elsewhere, `--download-model` or `BOOKKIT_DOWNLOAD_MODEL=1` allows it; without either, wording alone is compared and the output says so;
- the MCP tools compare meaning only when the model is cached or `BOOKKIT_DOWNLOAD_MODEL=1` is set in the MCP server's environment.

The cache is inside `node_modules`, so a reinstall deletes it; set `BOOKKIT_MODEL_CACHE` to keep it elsewhere. `--quick` (`bookkit check`) and `--no-semantic` (`check:corpus`) skip the model.

## Several books: one meaning per mechanism

When one author keeps several books in a workspace, `bun run check:corpus` holds each mechanism to one meaning across them. `corpus.json` at the workspace root names the books that share a vocabulary; a book outside that list is compared only with itself. A lexical pass compares wording, a semantic pass compares meaning (cutoff 0.79 for the default model; `--threshold`), and judges' verdicts in `corpus-judgments.json` flag pairs that word the same idea differently. Close pairs are grouped into clusters, each one a decision for the author: one mechanism, or two with sharper boundaries.

```sh
export BOOKKIT_JUDGE_COMMAND="claude -p"      # any program that reads a prompt on stdin and prints its reply
bun run bookkit judge <mechanism>             # three blind judges on its nearest pairs; records their calls
bun run bookkit rule <a> <b> --distinct "<what each one's lever is>"
bun run bookkit merge <keep> <drop> --reason "<the lever and evidence they share>" --dry-run
bun run bookkit sync <mechanism>              # copy the copy edited last to the mechanism's other books
```

- **`judge [mechanism]`** writes one blind prompt per judge under `.bookkit/judging/` and, with a judge command (`--run "<command>"` or `BOOKKIT_JUDGE_COMMAND`), asks each judge in an empty folder of its own and records the answers. Without one, paste each prompt into a fresh session, save the replies as `answer-<n>.json` in the request folder, and run `bookkit judge record`. A verdict stops applying when either mechanism's text changes.
- **`rule <a> <b> --distinct "<reason>"`** records in `corpus.json` that two mechanisms are different ideas.
- **`merge <keep> <drop> --reason "<why>"`** records that they are one: in every book of the corpus, `<drop>` becomes `<keep>` with one contract, its glossary entry and examples move, and references are rebound. It removes `/read/mechanisms/<drop>`; note that in a published book's release notes.
- **`sync <mechanism>`** copies a shared mechanism's contract to its other books, so the copies do not drift.

`check:corpus --book <slug>` reports only the pairs that involve one book. `--mode error` exits 1 while a cluster, drift, or stale ruling remains; `--json` and `--export <file>` print machine output, and `--eval` scores the models and the judges against the author's recorded rulings.

## What readers get

- **Wayfinding.** Each chapter says "Chapter N of M". The menu lists the reading sections and marks the current one. The home page and reading hub offer "Continue: <chapter>" for the last chapter opened on this device, with Clear, and a draft book says it is a draft on both. `[` and `]` jump to the previous and next section heading on a page.
- **Links both ways.** A mechanism page lists the chapters that use it and the glossary terms that name it. A chapter shows its prerequisites as "Read first" and the actions for its mechanisms. An action links its mechanism's examples and chapters, and a glossary term links each mechanism it lists.
- **Toolkit pages** show a runbook action's owner, review cadence, steps by situation, escalation, and drills, in the order the PDF and EPUB use.
- **Search** matches the words a page shows, including an action's trigger and steps, a mechanism's definition, and inline code; code blocks and MDX comments are left out. Results come in one list, best match first, each naming its section and, for a heading, its page. The search field is an ARIA combobox, so a screen reader announces the result the arrow keys select. A 404 page offers a search for the words of the missing address.
- **Releases.** The release notes page and RSS feed list each release note, with dates as written, whatever the build's time zone. The version archive links each older version to its entry in the release notes.
- **Ask** (server runtime only): a panel that answers a question from the book's passages and cites them. It is on unless `features.aiQa` is `false` (the starter sets `false`). The server writes the answer with `OPENAI_API_KEY` or `GROQ_API_KEY`; without either, the panel shows the matching passages. On a reader's first question, the browser downloads two small models from Hugging Face (`Xenova/all-MiniLM-L6-v2` and `Xenova/ms-marco-MiniLM-L-6-v2`) to rank passages; there is no prompt before the download, and the panel's "Turn off" button disables Ask in that browser.
- **What search engines and link previews see.** A page's title is its own name and the book's short title; its description is the chapter's `summary`, a definition, an action's trigger, or the first paragraph. Every page gets a PNG link-preview image in the book's typefaces, and ends with a colophon: title, byline, `site.defaultMeta.description`, and a link to start reading.

## Exports

`bookkit build` writes `dist/exports/book.pdf` and `dist/exports/book.epub`, plus one PDF and EPUB per chapter under `dist/exports/chapters/`. The book files hold the whole book in reading order: the chapters, each mechanism followed by its actions, the glossary, and the examples, with a table of contents and, in the PDF, bookmarks. Title, author, and language come from `book.config.ts`, the version and date from the latest release note, and a rebuild of unchanged content is byte-identical.

- **Markdown.** Inline code, fenced code at any indentation, GFM tables, task lists, nested lists, reference-style links, footnotes, setext headings, rules, and HTML character references. The PDF draws code in Courier, tables as a grid that fits the page (row by row when columns would be too narrow), and footnotes as numbered notes after each entry; the EPUB uses EPUB 3 endnotes that link back.
- **HTML.** The tags import keeps render in both formats: `<kbd>`, `<details>` (shown open, its summary in bold), `<sup>`, `<sub>`, HTML tables and lists, and `align`. Other tags show their text, a script's text never shows, and an embed (`<iframe>`) becomes a link to the page it shows, named by its title.
- **Links.** Headings carry the site's ids. In the PDF, text is set in bold and italic faces and links are clickable: to a chapter, mechanism, or heading inside the PDF (`book.pdf#nameddest=chapters/overview`), else to the site. A link whose scheme the link rule refuses shows only its text.
- **Images.** Images under the book's `public/` folder are embedded: PNG, JPEG, GIF, SVG, and WebP in the EPUB, PNG and JPEG in the PDF. A remote image (never downloaded), a missing file, or a format the export cannot carry shows its alt text instead, and the build warns; an image with no alt text is left out.
- **Scripts.** The PDF's fonts cover Latin (with Latin Extended and Vietnamese), Greek, and Cyrillic, using Noto Sans (SIL Open Font License) beyond Western European text. For another script, such as CJK, set `exports.pdfFont`. Text the fonts cannot draw, or a script that needs shaping such as Devanagari, stops the build with the entries and characters at fault; set `exports: { pdf: false }` to publish the EPUB alone.

`bun run bookkit export [book]` (or `bun run export:gitbook -- --book <book>`) writes a GitBook folder: one page per record in reading order, a `SUMMARY.md` with parts and nested actions, MDX converted to Markdown, links rewritten, local images in `.gitbook/assets/`, and the site's link rule and HTML allowlist applied. The default folder, `apps/<book>/exports/gitbook`, is gitignored; `--out <dir>` must be missing, empty, or an earlier export.

## Import

`bun run bookkit import <book> --dir <folder>` reads `.md`, `.mdx`, and `.markdown` files, subfolders included. `--dry-run` prints the plan and writes nothing.

- **Titles and order.** A note's title comes from its frontmatter `title`, else its first `#` heading, else its file name; a leading `# Title` is removed from the body so it does not repeat. Ordering prefixes in file names (`01-`, `1.`, dates) set the reading order. `summary` or `description` carries over.
- **Drafts.** Notes in a `drafts/` folder, or with `draft: true` or `published: false`, import as drafts; the rest as published.
- **Skipped.** `README` and `index` files are skipped unless `--include-readme`. Frontmatter fields chapters have no place for (`tags`, `date`, …) are listed.
- **Links and images.** Links between notes point at the new chapters, and local images are copied to `public/images/`. An address the link rule refuses is removed, the link keeps its words, and the report lists it under "Addresses removed" with its note and line.
- **MDX.** HTML comments become MDX comments, `<https://…>` autolinks become links, and `{braces}`, tag-like `<placeholders>`, and `import`/`export` lines are escaped, so they render as written; code is left as it was. Common HTML is kept (`<details>`, `<kbd>`, `<img>`, `<sup>`, `<sub>`, tables, and an `<iframe>` with a web address), minus what the allowlist refuses, and other tags show as text. A note's `<script>` and `<style>` go with what they hold, an `<iframe>` with no title gets one from the page it shows, and the report lists all of it under "HTML left out".
- **Compiled.** Every chapter is compiled with the book's MDX compiler, and a failure names the chapter, line, and source note.
- **Re-import.** Importing the same folder again updates chapters in place and appends new notes. A chapter edited since its import is kept unless `--force`; `chapters/imported.json` records what came from where.

## Deploy

Every book builds to a static site and publishes to [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/). For deploy, a book is a folder in `apps/` with `src/book.config.ts` and `wrangler.jsonc` (Worker name `bookkit-<slug>`, `dist/` as the assets folder, the 404 page for misses, and URLs without trailing slashes).

`bun run bookkit deploy [book...]` publishes all or none:

1. `verify --all` (without its build of every book), so content errors in any book stop the run;
2. a build of each selected book and `check:build` on its `dist/`;
3. for a book on a custom domain, a comparison with the live page count (`--allow-page-drop` publishes when more than a quarter of the pages would disappear);
4. `wrangler deploy` for each book, or wrangler's dry run with `--dry-run`.

Refusals are listed in a summary with their reasons, and nothing is published unless every book passed. If wrangler then fails for one book, the books already published stay up. Each Worker version's message is `<sha12> <subject>` of the commit.

- **Uncommitted changes** in the selected books, or outside `apps/`, refuse a real deploy; `--allow-dirty` publishes anyway and says so in the version message. `--dry-run` rehearses uncommitted work and exits 0 when it passes.
- **`--no-build`** publishes the `dist/` an earlier deploy run built, checked, and stamped (in `apps/<book>/.bookkit/deploy-stamp.json`) at the current commit. It refuses a missing, stale, or edited `dist/`; `bookkit build` does not stamp.
- **No book named** means the current book (`bookkit use`), else every book; `--all`, or `bun run deploy`, means every book. Unknown flags exit 1.

The `*.workers.dev` address works at once and is `noindex` (`public/_headers`). For your own domain, set `site.url` to it and add `"routes": [{ "pattern": "<domain>", "custom_domain": true }]` to the book's `wrangler.jsonc`; the next deploy attaches the domain, whose zone must be on your Cloudflare account.

### Deploy from CI

`.github/workflows/deploy.yml` publishes after CI passes on a push to `main`, or when run by hand on `main`. It is off until you turn it on:

1. Set the repository variable `DEPLOY_BOOKS` (Settings → Secrets and variables → Actions → Variables) to the books to publish, separated by spaces, or to `--all`.
2. Add the `CLOUDFLARE_API_TOKEN` secret, and `CLOUDFLARE_ACCOUNT_ID` if the token can see more than one account.

With no `DEPLOY_BOOKS` the job is skipped; with `DEPLOY_BOOKS` and no token it fails. The token is visible only to the publish step, which runs `--no-build` on what the job's dry run checked. A run for a commit that `main` has moved past publishes nothing. Forks do not inherit the variable, so a fork publishes only what its own `DEPLOY_BOOKS` names.

### Static and server builds

With `site.runtime` unset or `"static"`, the build serves the reader site, search, the exports, the sitemap, `robots.txt`, RSS, link-preview images, the MCP manifest (`GET /api/mcp.json`), and the `_headers` rules. Routes that need a request handler (feedback, analytics, the Ask panel, release webhooks and email, MCP tool calls) get no file in `dist/`, so they 404, and pages leave out the feedback widget, the Ask panel and its in-browser models, analytics beacons, and the language and version switchers.

`previewAccess` cannot protect static files, because Astro prerenders the pages; protect drafts at the edge (for example Cloudflare Access) instead.

## Server runtime

`site.runtime: "server"` runs the `/api/*` routes on demand while pages stay prerendered. It needs an Astro adapter in `astro.config.mjs` (for example `@astrojs/node`); a build without one stops and says so. The bundled `wrangler.jsonc` serves static assets only, so `bookkit deploy` does not run these routes.

The server reads its environment:

| Variable | Effect |
| --- | --- |
| `BOOKKIT_AUTHOR_TOKEN` | Required. 32 or more random characters (`openssl rand -hex 32`), sent as `Authorization: Bearer <token>`. It gates the release webhook and email routes (under `bookkit dev` too), the analytics, feedback, and preview-analytics reads, and MCP `tools/call`; the reads and tool calls are open under `bookkit dev`. Without it these answer 500 and the server log says why; a wrong token gets 401. |
| `BOOKKIT_DATA_DIR` | Where the server keeps what readers send; see [Where data lives](#where-data-lives). |
| `BOOKKIT_RELEASE_WEBHOOKS`, `BOOKKIT_RELEASE_EMAIL_TARGETS` | Delivery targets for release notifications, as JSON arrays or comma-separated URLs ([`releases/README.md`](./packages/astro-bookkit/src/releases/README.md)). |
| `OPENAI_API_KEY`, `GROQ_API_KEY` | The Ask panel's answers: OpenAI (`gpt-4o-mini`) first, Groq (`llama-3.1-8b-instant`) as the fallback. With neither, `/api/qa.json` answers 503. |

```sh
curl -X POST -H "Authorization: Bearer $BOOKKIT_AUTHOR_TOKEN" https://<site>/api/release-webhook.json
```

Reader routes refuse a body over their limit (413) and more requests per minute from one client address than their limit (429); Q&A also caps a server process at 60 questions a minute. Behind a proxy, the adapter must report each reader's address, or every reader shares one limit. On `/read/analytics`, enter the author token once to see what readers sent; the browser keeps it per book and the same panel forgets it.

## Where data lives

| Path | What | Committed |
| --- | --- | --- |
| `.bookkit/local.json` (workspace root) | The current book, set by `bookkit use`. | No |
| `.bookkit/dev/` | The dev servers `bookkit dev` started. | No |
| `.bookkit/judging/` | Judge requests and answers. | No |
| `corpus.json`, `corpus-judgments.json` | Which books share a vocabulary, the author's rulings and merges, and judges' verdicts. | Yes |
| `apps/<book>/dist/` | The built site and exports. | No |
| `apps/<book>/.bookkit/` | The deploy stamp, and on a server what readers send: `reader-analytics.jsonl`, `preview-analytics.jsonl`, `export-analytics.jsonl`, `release-analytics.jsonl`, `feedback-events.jsonl` (plus `feedback-events.json` from before feedback became append-only). | No |
| `apps/<book>/proposals/`, `apps/<book>/exports/` | `propose --write` bundles and the GitBook export. | No |
| `node_modules/@xenova/transformers/.cache/` | The embedding model, unless `BOOKKIT_MODEL_CACHE` is set. | No |

`BOOKKIT_DATA_DIR`, resolved against the server's working directory, replaces `apps/<book>/.bookkit/` for reader data. Set it when the server runs outside the folder the book was built in (a copied `dist/`, a container), and give each book its own. Under `bookkit dev` the records go to `apps/<book>/.bookkit/`; deleting those files clears what the dashboards read. The release log names each delivery by its target's name, or its scheme and host, never its URL. On Cloudflare Workers the handlers cannot write files, so reader records are dropped and the server logs a warning.

## MCP

Bookkit serves its content and checks to AI agents over the Model Context Protocol, in two ways:

- **stdio, in a workspace:** `bun run mcp` (`-- --book <slug>` picks the book the content tools read; the default is the first folder under `apps/`). `.mcp.json` registers it as `bookkit`, so Claude Code offers it in this repository with no server running.
- **HTTP, from a book:** `bookkit dev` answers `POST /api/mcp.json`. A static build serves only the `GET` manifest, whose `toolCalls.served` says whether the address answers tool calls; on a server deployment, `tools/call` needs the author token, and `resources/*` and `tools/list` do not.

The tools, each prefixed `bookkit.`: `list_books`, `read_book`, `list_content`, `list_mechanisms`, `list_skills`, `get_content_contract`, `check_content`, `validate_book`, `compile_book`, `export_book`, `check_separation`, `check_corpus`, `find_similar_mechanisms`, and `create_book` (`book` and `title`). `get_content_contract` returns each section's fields, its JSON Schema, and a template that compiles; `check_content` compiles one candidate file without writing it. `validate_book`, `compile_book`, and `check_content` apply the book's status rule; `releaseMode: true` on `validate_book` or `check_content` forces release rules on a draft, and `check_content` reports `bookStatus` and `releaseRules`. Results carry a `text` item with the JSON and the same object as `structuredContent`. Without MCP, `bun run bookkit contract` and `bun run bookkit check <file> --json` give the same answers.

## Troubleshooting

**`check:types` fails with "git ls-files failed: not a git repository".** A new standalone project has no git history yet. Run `git init && git add -A && git commit -m "First draft"`, then `bun run verify -- --all`.

**A published book fails with `DRAFT_IN_RELEASE`.** Some record still has `status: draft` (or none). Finish it and set its status, or move the book back to `in-review` until it is done.

**The book builds but search engines never see it.** Its status is not `published` or `stable`, or `site.indexable` is `false`, so every page is `noindex`. A `*.workers.dev` address is `noindex` regardless; publish on the domain in `site.url`.

**A chapter is missing from search and the sitemap.** It has fewer words of prose than `site.minIndexableWords` (default 60), so it counts as a stub. `bun run bookkit` lists the stubs.

**`bookkit check` says "semantic pass unavailable".** The embedding model is not downloaded, and there was no terminal to ask. Pass `--download-model`, set `BOOKKIT_DOWNLOAD_MODEL=1`, or use `--quick`.

**`check:build` refuses preview access.** `previewAccess.enabled` is `true` on a static build, where a token gate cannot protect prerendered files. Set it to `false`, or serve the book with the server runtime.

**Deploy refuses with "uncommitted changes".** Commit them, or rehearse with `--dry-run`. `--no-build` refuses a `dist/` that a deploy run did not stamp at the current commit; run `deploy <book> --dry-run` first.

**The build stops because the PDF cannot draw some characters.** The book uses a script the bundled fonts lack, or one that needs shaping. Set `exports.pdfFont` to a TTF or OTF font that covers it, or `exports: { pdf: false }`; the EPUB is not affected.

**A link renders as plain text.** Its address uses a scheme the link rule refuses (`UNSAFE_LINK`); `bookkit check` names the file and line.

**A tag, attribute, or `{expression}` is missing from the page.** The HTML allowlist removed it (`UNSAFE_HTML`). `bookkit check` names the line and says what to write instead, for example an `.svg` file shown as an image in place of inline `<svg>`.

**`bookkit dev` says the port is in use.** Another server holds it: `bun run bookkit dev status` finds one Bookkit started, or pass `--port <n>`.

**A semantic overlap appears after a model or threshold change.** Run `bun run check:corpus -- --eval` to score the models against the recorded rulings before you rule on the pair.

## Example books in this repository

| Book | Frame | Status |
| --- | --- | --- |
| [`apps/on-call`](./apps/on-call) | runbook | published |
| [`apps/bad-people`](./apps/bad-people) | intervention | draft |
| [`apps/running-hot`](./apps/running-hot) | intervention | draft |
| [`apps/crumple-zone`](./apps/crumple-zone) | intervention | draft |

The On-Call Runbook is the one to read first: four mechanisms, each with one action of 10 minutes, a drill, and an escalation. `check:runbooks` prints its compliance matrix:

```txt
$ bun run check:runbooks
REVIEW DATES on-call: judged as of 2026-02-10 (reviewsAsOf in book.config.ts), not today
COMPLIANCE on-call: 4/4 controls with tool coverage
  DIAG-REPRO-01 → minimal-repro-doc [capture-repro] ✓drilled ·review due 2026-03-12
  ESC-RAMP-01 → bounded-escalation [ramp-escalation] ✓drilled ·review due 2026-03-12
  INC-TRIAGE-01 → incident-triage [classify-alert-severity] ✓drilled ·review due 2026-03-12
  REL-ROLLBACK-01 → rollback-first-change [identify-rollback-candidate] ✓drilled ·review due 2026-02-24
```

The other three are drafts by one author, held to one vocabulary through `corpus.json`. `bun run list:books` names every book in the workspace.

## Working on Bookkit

Engine code lives in `packages/astro-bookkit/`, the standalone generator in `packages/create-bookkit/`, the CLI and checks in `scripts/`, and the books in `apps/`. Books never fork the engine, and the engine never names a book; a book varies through its config or an engine capability. A book app owns its content and the starter's files (`book.config.ts`, `src/lib/read-copy.ts`, the examples index, `package.json`, `wrangler.jsonc`, `README.md`, `TODOS.md`). Every other file is a shim copied from `packages/astro-bookkit/templates/book-app/`: `bun run check:shims` fails when one drifts, and `bun run sync:shims` rewrites them.

| Document | Covers |
| --- | --- |
| [`docs/architecture.md`](./docs/architecture.md) | Layers, the two pipelines, the engine module map, and import tiers. `check:architecture` keeps it true. |
| [`AGENTS.md`](./AGENTS.md) | The invariants every change must keep. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Lanes, the checks each change needs, tests, and CI. |
| [`docs/design-notes.md`](./docs/design-notes.md) | Why the invariants exist. |
| [`docs/authorship-model.md`](./docs/authorship-model.md) | The "book as software" model behind the three layers. |
| [`docs/bets.md`](./docs/bets.md) | What the maintainers work on next (`bun run bookkit bets` measures the active bet). |
| [`docs/tech-debt-register.md`](./docs/tech-debt-register.md) | Known cross-cutting debt. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Dated behavior changes and migration notes, newest first. |
| [`packages/astro-bookkit/README.md`](./packages/astro-bookkit/README.md) | The engine package. |
| [`.codex/skills/`](./.codex/skills/README.md) | Checklists for agents by lane. |

## License

Dedicated to the public domain under [CC0 1.0 Universal](./LICENSE).
