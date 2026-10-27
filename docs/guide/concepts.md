# Concepts and configuration

The records a book is made of, the frames and statuses that decide which rules apply, the fields in `book.config.ts`, and the files Bookkit writes.

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

| `frame.slug` | Required steps in `chapters/00-overview.mdx` (without one, in the chapters together) |
| --- | --- |
| `intervention` (default) | recognition, exoneration, mechanism, agency |
| `explainer` | definition, example, implication |
| `field-guide` | steps, failure-modes, checklist |
| `runbook` | ownership, trigger, steps, escalation, verification |

`frame.steps` lists the steps the overview must carry, by id. It may add a frame's optional steps but not leave out a required one, and a step the frame does not have, or a `frame.slug` that is not one of the frames above, is an error naming the nearest match. A book with no `frame` follows `intervention`.

A step counts when a heading (levels 1 to 4) is the step's name and nothing more: its whole text, slugged as the site slugs heading ids, is the step's id. `## Failure Modes`, `## Failure modes`, and `## failure-modes` all count for `failure-modes`, and a link to `#failure-modes` lands on that heading; `## Failure modes we have seen`, `## Owner` (for ownership), and a line such as `Owner: Payments` do not count. `bookkit check <folder> --frame` and `bookkit try` hold each document of a folder to the same rule. A book with no `00-overview.mdx` (an imported one) is checked across its chapters together. A missing step is a warning. In a runbook book every action also needs `escalation` and `runbookSteps` (a warning in a draft, an error once published), and `bun run check:runbooks` derives the book's control coverage matrix.

## Status

The book's `status` in `book.config.ts` decides which rules apply and whether search engines may index the book.

| Book status | Checks | Search engines |
| --- | --- | --- |
| `draft`, or no status | Draft records are allowed. Broken links, unknown prerequisites, and unsafe links are warnings. | Every page is `noindex`, `robots.txt` disallows everything, and the sitemap is empty. |
| `in-review` | As for `draft`, except that a book with no chapters is an error (`BOOK_EMPTY`). | As for `draft`. |
| `published`, `stable` | Release rules: a draft record is an error (`DRAFT_IN_RELEASE`), as are broken links, unknown prerequisites, unsafe links, missing runbook fields, and a book with no chapters. `site.url` must be a public address and `site.indexable` must not be `false`. | Indexable. |

Every chapter, mechanism, action, example, and glossary entry has its own `status` with the same four values (default `draft`). A draft record is still built and shown: chapter pages label any status other than published. A record marked `published` or `stable` is held to release rules even in a draft book.

Errors exit 1 whatever the status; `bun run validate:release` is an alias of `bun run validate`.

## Book configuration

`apps/<book>/src/book.config.ts` exports `bookConfig`, typed `as const satisfies BookConfig`; each field is documented on the type in [`packages/astro-bookkit/src/book/config.ts`](../../packages/astro-bookkit/src/book/config.ts). The fields an author sets most:

| Field | Effect |
| --- | --- |
| `status` | `draft`, `in-review`, `published`, or `stable`; see [Status](#status). |
| `frame.slug`, `frame.steps`, `frame.intent` | The frame, the steps its overview carries (see [Terms](#terms)), and what the book moves the reader through. |
| `objectives`, `causalStance` | Who the reader is at the start and the end, and the book's causal claim. Both show on the "About this book" page (`/read/overview`). |
| `author: { name, url? }` | The byline on the home page and in each page's colophon. |
| `site.url` | The published address: canonical links, the sitemap, `robots.txt`, and the exports' links use it. |
| `site.indexable` | `false` keeps a published book out of search engines and fails the release check. |
| `site.minIndexableWords` | Chapters with less prose than this (default 60; `0` turns it off) stay readable but are `noindex` and left out of the sitemap and search. |
| `site.runtime` | `"static"` (default) or `"server"`; see [Server runtime](./publishing.md#server-runtime). |
| `home` | The home page's `kicker` and its mechanisms card (`mechanismsCard: { title, description }`). |
| `readHub` | The reading hub's `lede` and its "Where to start" cards (`quickStartCards: [{ title, description, href, recommended?, funnelStep?, eyebrow? }]`). Leave the cards out for the defaults: About this book, the chapters in order, and "Start with chapter 1: <title>". |
| `mechanismsIndex` | The mechanisms index's `lede`, and an `urgency` per mechanism slug (`urgent`, `high-leverage`, or `stabilize`) that orders the list and adds filters. A slug that names no mechanism is a warning in a draft and an error once published. |
| `relatedBooks` | `[{ title, href, description? }]`, listed as "Other books" on the home page. |
| `exports.pdf` | `false` publishes without a PDF. |
| `exports.pdfFont` | A TTF or OTF file, relative to `apps/<book>/`, for scripts the bundled fonts lack, such as CJK. |
| `previewAccess` | Token-gated previews. Static builds cannot honor it: `check:build` fails a static build that enables it. |
| `localization` | The book's languages: `defaultLocale`, and `locales: [{ code, label, isDefault?, completeness? }]`. `defaultLocale` is also the PDF's and EPUB's language. See [Translations](#translations): today only `bookkit dev` serves them. |
| `features.aiQa` | `false` turns off the reader's Ask panel, which otherwise appears on a server runtime; see [What readers get](./reader-site.md). |
| `reviewsAsOf` | For a runbook book whose content is an example: the date `check:runbooks` judges review cadence on, instead of today. |

The home page, reading hub, and mechanisms index are shared pages, so their copy lives in these fields rather than in the page files.

## A book's own pages

A book app holds no pages of its own by default. `bookkit()` in `astro.config.mjs` serves every book the engine's pages, API routes, and middleware (`packages/astro-bookkit/src/routes/`), reading the book's `book.config.ts` and content through the virtual module `virtual:bookkit/book`.

To serve one page differently, put a file in `apps/<book>/src/pages/` that serves the same URL: `src/pages/read/examples/index.astro` (or `src/pages/read/examples.astro`) replaces `/read/examples`, and `src/pages/sitemap.xml.ts` replaces `/sitemap.xml`. It replaces that URL only; `/read/examples/[...slug]` stays the engine's. Names starting with `_` do not count, as Astro skips them. Start from the engine's file in `src/routes/pages/`, and read the book from `@bookkit/astro-bookkit/routes/runtime` (`bookConfig`, `bookEntryPoints`, and the rest of the book's runtime), with `@bookkit/astro-bookkit/routes/BaseLayout.astro` as the layout; `apps/running-hot/src/pages/read/examples/index.astro` does this. A file at a URL the engine does not serve is an ordinary Astro page.

## Author pages

Each book also serves three pages for its author, all kept out of search engines:

- `/read/tools`, Author tools: links to analytics, release notes, downloads, and the new-book form.
- `/new-book`: a form that drafts a new book's brief, setup checklist, config, SEO settings, and link-preview image addresses, to copy one at a time or download as JSON.
- `/read/analytics`: what readers sent, which needs the [server runtime](./publishing.md#server-runtime).

The reading hub's "For authors" card links Author tools. Under `bookkit dev` and in a `previewAccess` preview, the menu's "For authors" group links Author tools and the form as well. On any page, `g a` opens Author tools and `g b` opens the form; `?` lists the shortcuts.

## Translations

A translation is a second file for the same record, in the same folder: the same `slug`, plus `locale: <code>` in its frontmatter (`chapters/20-rollback-first.es.mdx` beside `20-rollback-first.mdx`). Each language is listed in `book.config.ts`:

```ts
localization: {
	defaultLocale: "en",
	includeDefaultPrefix: false, // the default language at /read/…, not /en/read/…
	label: "Language",
	locales: [
		{ code: "en", label: "English", isDefault: true, completeness: 1 },
		{ code: "es", label: "Español", completeness: 0.2 },
	],
},
```

Under `bookkit dev`, `/es/read/chapters/rollback-first` shows the Spanish file, and the page's `lang` is `es`. A record with no translation shows in the default language, and in a locale whose `completeness` is below 1, pages say the translation is in progress. The engine has breadcrumb labels for `en` and `es` only. For any other code, the build stops until the language has an entry in `packages/astro-bookkit/src/routes/read-copy.ts`.

A build does not serve translations yet. It prerenders each page once, from the default-language file, so a built site has no `/es/…` pages, static or server. The language switcher appears only with `site.runtime: "server"`.

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
