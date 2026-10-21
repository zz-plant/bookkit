# What the checks enforce

The rules `bookkit check`, `validate`, `check:build`, `check:runbooks`, and `check:a11y` apply. `bun run verify` picks the ones a change needs.

## What `bookkit check` runs

`bookkit check <book>` runs three passes. Validation reports errors (which exit 1) and warnings. The corpus check compares the book's mechanisms with other books' (by meaning when the embedding model is present; `--quick` compares wording only) and fails while an overlap is unresolved. Suggestions report mechanisms named in prose but not bound, mechanisms no chapter lists, and recurring terms that may be ideas worth naming; they never fail the check. `bookkit check` on a folder exits 1 on a broken contract file and, with `--frame`, on a missing frame step, so a runbook repository can be gated in its own CI. A folder inside a book (`bookkit check apps/<book>/src/content/book/chapters`) is checked as part of the book instead: its frame, status, references, and the MDX compiler, reporting only the files in the folder.

`bookkit check <chapter.mdx>` also says how far the chapter is from drafted: its words of prose against `site.minIndexableWords` (a chapter below it is a stub, kept out of search and not counted by `bookkit bets`), the mechanisms its `mechanisms:` binds (a slug the book does not define is named apart, beside its error), and the book's other mechanisms, so a new idea can bind an existing slug before it gets a name of its own. This is advice and never fails the check; `--json` reports it as `draft`.

`bun run verify -- --all` runs every gate: formatting and lint, types, tests, content, shared pages, the architecture map, and a build of every book followed by `check:build`. CI runs it on every push and pull request to `main`. `--list` shows the plan, and `--json` prints the results for an agent.

## Content rules

`bun run bookkit check` and `bun run validate` (every book, or one with `-- --book <book>`) apply each section's contract. `bun run bookkit check <file.mdx>` explains a single file, with the book's suggestions about it, and `bun run bookkit contract [section] [--json]` prints what each field needs. The rules that most often surprise an author:

- **Required fields.** A mechanism needs a `slug` and `title`, an action a `slug`, a `mechanism`, and a name, and a chapter a `slug` and `title`; without them the file is an error. A missing definition, boundaries, steps, or trigger is a warning. A field written at the wrong level, where the build would ignore it, is an error (`FIELD_MISPLACED`).
- **Bindings.** An action, chapter, or example naming a mechanism the book does not define is an error, with the closest slug suggested. An invalid or duplicate slug is an error.
- **Reading order.** A prerequisite that comes after its chapter in reading order is a warning (`PREREQUISITE_ORDER`), as is a release note the release page cannot list (no version or date, or a date that is not YYYY-MM-DD).
- **Links.** An address is allowed when it has no scheme (a page of the book, an anchor, a relative path) or uses `http`, `https`, `mailto`, `tel`, or `ftp`. Any other, such as `javascript:`, `vbscript:`, `data:`, or `file:`, is `UNSAFE_LINK` (an error in published content, a warning in a draft), in a Markdown link and in an `href`, `xlink:href`, `formaction`, `<iframe src>`, or quote `cite`. The site keeps the link's words and drops the address; an `<iframe>` without a safe `src` is left out. A link that opens a new window gets `rel="noopener"`.
- **Raw HTML.** Content may use the elements Markdown writes, the presentational ones import keeps (`<kbd>`, `<details>`, `<sup>`, `<span>`, tables, …), and an `<iframe>` with a safe `src`; the list is `packages/astro-bookkit/src/utils/html-allowlist.ts`. Each element keeps the global attributes (`id`, `class`, `title`, `lang`, `dir`, `role`, `aria-*`) and its own (`href` on `<a>`, `src` and `alt` on `<img>`, `colspan` on `<td>`, …). `<script>`, `<style>`, `<meta>`, `<link>`, `<base>`, `<template>`, `<noscript>`, and `<title>` are left out with what they hold, and any other element (a form, a button, an `<svg>`, a `<video>`) is left out keeping its contents. Event handlers, `style`, `data-*`, `srcdoc`, `set:html`, and unlisted attributes are removed. Each is `UNSAFE_HTML`, an error in published content and a warning in a draft, with the line, what goes, why, and the fix.
- **Code in MDX.** An expression that is not a comment or a plain literal, a spread (`{...props}`), and an `import`/`export` block are removed, because the build would run them unchecked; components keep only plain props. These are `UNSAFE_HTML` too.
- **Images.** An image a record shows (`![alt](/images/x.png)` or `<img src>`) that names no file under the book's `public/` folder, or beside the record for a relative path, is `IMAGE_MISSING`: a warning in a draft, an error under release rules. Addresses on the web are not checked.
- **Lists.** A list field written as text (`prerequisites: start`) is reported as one that must be a list, with the value rewritten as one.
- **Release notes.** `bookkit check <releases/file.mdx>` and validation report a note the release page would leave out (no `version` or `date`), sort out of place (a date that is not YYYY-MM-DD), or misread (a version that is not x.y.z, a `summary` that is not text, `highlights` that is not a list). `bookkit contract release` lists the fields.
- **Content is data.** Content files may not import modules or contain `<script>` or `<style>` (`check:separation`).
- **Glossary links (advice).** Validation lists, as INFO, each chapter's first use of a glossary term that is not a link, with file and line. It never fails a check; `validate-book --json` reports it under `info`.

## Build checks

`bun run check:build` inspects each built `dist/`, and deploy and CI run it after every build:

- the home page, 404 page, `robots.txt`, sitemap, search index, release-notes feed, and `exports/book.epub` exist, and `exports/book.pdf` unless `exports.pdf` is `false`;
- no page rendered as a preview lockout, and preview access refused on a static build;
- a published or stable book is indexable; any other book is `noindex`; any book but a draft has at least one chapter page;
- canonical links, `robots.txt`, and the sitemap name one host; every sitemap URL is a built page whose canonical is that URL, and every search result lands on a built page and heading;
- author tools (`/read/analytics`, `/read/tools`, `/new-book`) are `noindex`;
- every page's link-preview image exists (an SVG-only image is a warning); no client code ships as raw TypeScript; every `.json` file parses;
- every PDF and EPUB in `dist/exports/` passes the engine's structural checks: no PDF link points at a destination the PDF lacks, no export link uses a scheme the link rule refuses, and no EPUB page holds an element or attribute the allowlist refuses.

## Runbook coverage

`bun run check:runbooks [--book <slug>]` audits a runbook book's controls (mechanism, action, drill, escalation, owner), prints its compliance matrix, and flags drift between release notes and the current coverage. `--mode error` fails on an overdue review, an undrilled control, or a control with no action.

## Accessibility

`bun run check:a11y` builds every book and runs axe-core over each page type and the open panels, in light and dark, at desktop and phone widths. It fails on a serious or critical violation. `bun run test:browser` drives search and the reading keys by keyboard. Both need Playwright's Chromium once (`bunx playwright install chromium`), and CI runs both in its `accessibility` job.
