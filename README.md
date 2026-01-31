# Bookkit — Recompilable Books (Astro + Bun)

This repository hosts **Bookkit**, a reusable book compiler, and one or more **book instances** built on top of it.

The core idea:

> A book is not a pile of chapters.
> A book is a specification that can be compiled into many coherent forms.

This repo is designed to make that idea *practical*, even with many contributors.

---

## What this repo is for

Bookkit is for books that aim to **intervene** — not just explain or persuade, but change how readers interpret situations and what they are able to do next.

It supports books that:

- define a **reader transformation** (start → end state)
- rely on a small, stable set of **mechanisms** (named concepts that do real work)
- enforce a **causal stance** (where blame and responsibility are routed)
- produce **executable actions**, not just insight
- can be updated, reordered, or extended without rewriting the core logic

If you can swap examples, reorder modules, or update domains without changing what the book *does*, the system is working.

---

## How the repo is structured

This is a **Bun workspace** with two layers.

### 1) The engine (reusable, book-agnostic)

`packages/astro-bookkit/`

This contains:

- **frames** — structural execution models (e.g. intervention, explainer)
- **blocks** — reusable content units (scene, pivot, mechanism intro, action)
- **schemas + validation** — concept governance, drift detection
- **compiler utilities** — dependency graphs, ordering constraints
- **shared styles** — base + print

This layer contains *logic*. It should not contain book-specific content.

---

### 2) Book instances (content + configuration)

`apps/<book>/`

Each book is just:

- a configuration file with the **irreducible author decisions**
- structured content records (MD / MDX)
- routing and branding

No engine logic lives here.

---

## Repo layout

```txt
.
├─ package.json              # Bun workspace root
├─ apps/
│  └─ bad-people/
│     ├─ astro.config.mjs
│     └─ src/
│        ├─ book.config.ts   # the book’s objective function
│        ├─ layouts/
│        ├─ lib/
│        ├─ pages/
│        │  ├─ api/
│        │  ├─ exports/
│        │  └─ read/
│        └─ content/
│           └─ book/
│              ├─ mechanisms/
│              ├─ toolkit/
│              ├─ chapters/
│              ├─ examples/
│              ├─ glossary/
│              └─ releases/
├─ packages/
│  └─ astro-bookkit/
└─ scripts/
   └─ lint-all.ts
```

---

## Built-in capabilities already implemented

The engine and the `apps/bad-people` instance already ship with features beyond frames and validation, including:

- **Search indexing + API endpoints** for chapters, mechanisms, glossary terms, and toolkit entries so the front end can power fast in-book search.
- **Export pipelines** for PDF and EPUB, including per-chapter and full-book exports, with analytics capture for export events.
- **Preview access controls** (token-based previews) plus preview analytics endpoints for gated review workflows.
- **Release tooling** for versioned release notes, RSS feeds, and optional webhook/email notifications.
- **Localization utilities** (locale routing middleware, completeness tracking, and localized content indexing).
- **SEO helpers** for site URLs, sitemaps, and robots.txt generation.
- **Reader feedback collection** plus dashboards for feedback and analytics inside the reading UI.

## Bun-first workflow

This repo assumes Bun.

Install dependencies:

```bash
bun install
```

Run a specific book:

```bash
bun run --filter @books/bad-people dev
```

Run validation across all books:

```bash
bun run lint:books
```

Build everything:

```bash
bun run --workspaces build
```

## Portable exports (GitBook or other Markdown tooling)

To generate a GitBook-compatible Markdown bundle for a specific book:

```bash
bun run export:gitbook -- --book bad-people
```

This writes a `SUMMARY.md` and a `README.md` plus a mirrored content tree under
`apps/<book>/exports/gitbook`, which can be imported into GitBook or other
Markdown-based compilers.

---

## What makes a book “real” here

A book is considered real when it has:

1. A transformation contract
2. A small mechanism set (6–8 recommended)
3. A declared causal stance
4. ≥1 executable action per mechanism
5. Ordering rules expressed as constraints, not a fixed outline

Full chapters, polished scenes, citations, and examples are not required for compilation.

Those are bindings, not the core.

---

## Frames (how structure is enforced)

A frame defines:

- what sections a module must contain
- what emotional sequence is enforced
- what validations apply

Examples:

- **intervention** — recognition → exoneration → mechanism → agency
- **explainer** — definition → example → implication
- **field-guide** — steps → failure modes → checklist

A book selects one frame. The engine enforces it.

---

## Validation (why the repo is strict)

Bookkit validates for:

- missing required frame steps
- unregistered or drifting mechanisms
- concept boundary violations
- missing action primitives
- ordering constraint violations

Validation can run in:

- **warn mode** (drafting, collaboration)
- **error mode** (release)

The goal is not punishment — it’s to keep the book recompilable over time.

---

## Creating a new book

Use an existing book instance as a template so you inherit the routes, middleware,
and wiring that the engine expects.

### Repo steps (add a new book instance)

1. **Scaffold the new book** from the template:
   - `bun run new:book -- --book <new-book> --title "Your Book Title"`
   - Optional: `--template <existing-book>` (defaults to `bad-people`)
2. **Review `apps/<new-book>/src/book.config.ts`** and replace TODO fields:
   - `title`, `slug`, `status`, and `site.url`
   - objectives, constraints, frame, and mechanism list
3. **Populate required content records** under `apps/<new-book>/src/content/book/`:
   - `mechanisms/`, `toolkit/`, `chapters/`, `examples/`, `glossary/`, `releases/`
4. **Run validation** before publishing:
   - `bun run validate` (warn mode)
   - `bun run validate:release` (error mode, for release gates)
5. **Add convenience scripts (optional)** to the root `package.json` if you want
   one-liners like `dev:<book>` or `build:<book>`.

Do not fork or duplicate the engine.

### Deployment + user-facing publish steps

1. **Set the public URL** in `apps/<new-book>/src/book.config.ts`:
   - Ensure `site.url` and `site.enforceHttps` match the production domain.
2. **Configure preview access** (optional) in `book.config.ts` if you want gated
   review links before launch.
3. **Create a release note entry** under `src/content/book/releases/` with a
   version and date so the release notes page and RSS feed are populated.
4. **Build the book for production**:
   - `bun run --filter @books/<new-book> build`
5. **Deploy the built output** with your hosting provider (Astro static output).
6. **Verify user-facing endpoints** after deploy:
   - `/` (home), `/read` (reading hub), `/sitemap.xml`, `/robots.txt`,
     `/release-notes`, `/release-notes.xml`
7. **Optional exports**:
   - `bun run export:gitbook -- --book <new-book>` to generate a GitBook-ready bundle.

---

## Contributing

This repo supports multiple contribution styles, including vibe-coding.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to choose the right lane and avoid fighting the system.

For architectural invariants (humans + AI), see [AGENTS.md](./AGENTS.md).

---

## License

Add license here.
