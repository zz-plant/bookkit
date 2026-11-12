# Product

<!-- impeccable:product-schema 1 -->

Product record for design work on Bookkit, confirmed by the owner on 2026-11-11. It covers the whole repository: the engine, the project generator, and every book app. Invariants stay in [AGENTS.md](./AGENTS.md); what gets worked on stays in [docs/bets.md](./docs/bets.md).

## Platform

web

## Users

**Primary: the reader of a built book.** They open the site, PDF, or EPUB to understand a named cause behind a problem and to carry out an action against it in 10 minutes or less. A runbook reader may arrive mid-incident; an intervention or field-guide reader arrives from search or a link and reads in order.

**Secondary: the author.** They write the book as MDX files, run `bun run bookkit` in a terminal, and commit with git. Their surfaces are check reports, CLI output, and the dev preview.

No reader outside the project exists yet: the books sit on placeholder domains and four of the five are drafts. Design decisions for readers rest on the owner's judgment, not on observed use.

## Product Purpose

Bookkit compiles a nonfiction book written as typed MDX records (chapter, mechanism, toolkit action, example, glossary entry) into a website with search, a PDF, an EPUB, and an MCP endpoint for AI agents. It checks every record against its contract before it builds or publishes.

It fits a book that names the causes behind a problem and gives the reader an action for each: an incident runbook, an operating procedure, a field guide, an argument that ends in remedies. It is the wrong tool for fiction, memoir, essays, narrative history, documentation sites, and blogs.

## Positioning

**Undecided.** Five headlines are in use and the owner has not chosen one:

- "AI may propose; the compiler decides" (the README's lead line)
- "book compiler, not a CMS"
- "compiler + governance + AI-interface platform"
- "compiler for verifiable operating procedures"
- "the book as software / reader as forker"

Do not write public copy that picks one, or coins a sixth, without the owner's decision.

## Operating Context

- **Reading:** a static site per book on Cloudflare, read on desktop and phone, in light and dark. The same content ships as a PDF and an EPUB, and toolkit pages keep the order those exports use.
- **Authoring:** files, a terminal, and git. There is no editor and no CMS. `bun run bookkit dev` previews a book at `http://localhost:4321`.
- **Gates:** `bun run verify` chooses checks from the files a change touches; CI runs `bun run verify -- --all`. Analyzers, agents, and model judges propose; the author accepts; nothing skips a check.
- **Layers:** author decisions in `apps/<book>/src/book.config.ts`, engine logic in `packages/astro-bookkit/`, replaceable content in `apps/<book>/src/content/book/`. Reader UI belongs to the engine, so every book shares it; a design change for one book is an engine capability or a config option, never a one-book exception.

## Capabilities and Constraints

- **Maintenance mode since 2026-11-10.** The engine is feature-complete. Design work is limited to fixing something broken on a reader page, build, or check. Redesigns, copy passes, new pages, and polish need a request from the owner that says it overrides maintenance mode ([AGENTS.md](./AGENTS.md#maintenance-mode-since-2026-11-10)).
- **Reader site** ([docs/guide/reader-site.md](./docs/guide/reader-site.md)): wayfinding ("Chapter N of M", Continue, `[` and `]` between headings), links both ways between chapters, mechanisms, actions, examples, and glossary terms, search as an ARIA combobox, release notes with RSS, a version archive, and a link-preview image and colophon on every page.
- **Server runtime only:** the Ask panel, feedback, analytics, release webhooks, and MCP tool calls. A static deploy, which is what the books use, serves none of them.
- **Translations and versioned addresses** work in `bookkit dev` only; no built site serves them.
- **Content contracts are fixed:** an action takes 10 minutes or less and the limit is not configurable; every action applies a mechanism the book defines; mechanism slugs are durable identifiers; the overview chapter has a heading per frame step.
- **Terminology:** chapter, mechanism, toolkit action, example, glossary entry, frame (`intervention`, `explainer`, `field-guide`, `runbook`), status (`draft` to `published`), corpus, ruling. A new named concept is registered as a mechanism or glossary term, not introduced in prose.
- **Stack:** Astro in a Bun workspace, deployed with wrangler. Neither package is published to npm.

## Brand Commitments

- **Name:** Bookkit. The books carry their own titles; the nonfiction books carry the byline Kanav Jain.
- **Visual authority:** [.claude/skills/reader-typography/SKILL.md](./.claude/skills/reader-typography/SKILL.md) is binding for anything a reader sees. It holds the two-voice system (the book's voice and the compiler's apparatus), the paper, ink, and rubric tokens, and the review checklist. Read it before any reader-facing change; this file does not restate it.
- **No urgency.** A book is calm software: no "New" badges, progress pressure, or animated attention-getters. State is shown only when it changes what the reader does.
- **Copy:** typographic punctuation in titles and config strings; one idea per paragraph; no filler and no startup language.
- **License:** CC0 1.0, public domain.

## Evidence on Hand

- **One published book:** the On-Call Runbook ([apps/on-call](./apps/on-call)), written to demonstrate the runbook frame. Its review dates are fixtures.
- **Four drafts:** Bad People, Running Hot, Crumple Zone (one author, one vocabulary through `corpus.json`), and Match Day to July 1. Many chapters are stubs.
- **Real captures:** page screenshots and terminal output in [docs/assets/](./docs/assets/), light and dark.
- **Absent, and not to be fabricated:** outside readers, testimonials, customers, usage numbers, benchmarks, pricing, and a real domain (every `site.url` is a placeholder).

## Product Principles

1. **The text is the interface.** A reader came for the book; everything the compiler adds stays out of its way and is recognisable as added.
2. **The compiler decides.** Structure a reader relies on is checked, not implied. A design that needs a validation weakened to pass is the wrong design.
3. **Every action is doable now.** Ten minutes, no heroics, usable by someone under pressure.
4. **One engine, every book.** A reader-facing change lands in the engine or in config and holds for all frames.
5. **Claim only what exists.** With no outside readers and a parked roadmap, surfaces say what the product does today.

## Accessibility & Inclusion

`bun run check:a11y` runs axe-core over each page type and the open panels, in light and dark, at desktop and phone widths, and fails on a serious or critical violation. `bun run test:browser` drives search and the reading keys by keyboard. CI runs both, so every reader-facing change must pass them.
