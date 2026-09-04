# Astro Bookkit (Engine Package)

This package contains the reusable, book-agnostic compiler engine.

## What belongs here

- frames and structural requirements
- schemas and validation rules
- compiler/orchestration utilities
- shared components/styles reused by multiple books
- MCP tool handlers and endpoint
- PDF/EPUB export generation
- heading extraction and markdown utilities
- Astro integration hook

## What does not belong here

- book-specific narrative content
- one-off behavior for a single title
- content-level hacks that should be modeled as schema/frame rules

## Canonical docs

- Architecture + commands: [`../../README.md`](../../README.md)
- Contribution workflow: [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Invariants + guardrails: [`../../AGENTS.md`](../../AGENTS.md)

Keep this README local in scope; link outward for policy.

---

## Package structure

```
src/
├── book/          # Graph engine, runtime, entrypoints, read-hub
├── components/    # Shared Astro components (Breadcrumbs, FeedbackWidget, etc.)
├── exports/       # PDF/EPUB generation, export metadata
├── frames/        # Structural requirements (e.g. intervention frame)
├── layouts/       # BookLayout + UI islands (search, QA, keyboard shortcuts)
├── markdown/      # Heading extraction, slugger, stripMarkdown
├── mcp/           # MCP tool handlers + JSON-RPC endpoint
├── schemas/       # Zod frontmatter schemas (mechanism, toolkit, chapter, example, glossary)
├── validators/    # Book validator, separation validator, frame validator
├── styles/        # Shared CSS (bookkit.css)
└── utils/         # HTTP helpers, markdown utilities
```

---

## Schemas

Typed Zod schemas for all content entity frontmatter:

- `mechanismSchema` — slug, title, definition, is/isNot boundaries, predictions, tests
- `toolkitSchema` — slug, mechanism ref, trigger, timeboxMinutes (≤10), steps, failureLooksLike
- `chapterSchema` — slug, title, status, prerequisites, order
- `exampleSchema` — mechanism ref, domain, title, status
- `glossarySchema` — slug, term, definition

Schemas are used by both the CLI validators and the MCP in-memory validators. Import from `@bookkit/astro-bookkit/schemas`.

---

## Validators

In-memory validation functions that return typed `NormalizedErrorPayload[]` results:

- `validateBookInMemory(options)` — validates frontmatter schemas, frame steps, mechanism/tool cross-references
- `checkSeparationInMemory(options)` — scans content for disallowed file extensions, imports, and script tags
- `validateFrameSteps(frame, presentStepIds)` — checks required frame steps are structurally present

These are consumed by the MCP tool handlers and can be called directly from scripts.

---

## Graph engine

`src/book/graph.ts` provides a DAG topology validator for chapter and mechanism prerequisite chains:

- `detectCycles(nodes)` — DFS cycle detection, returns cycle paths
- `computeTopologicalOrder(nodes)` — deterministic reading order with alphabetical tie-breaking
- `deriveReaderPathways(nodes)` — generates "Foundational" and "Fast-Path" reading sequences

---

## MCP endpoint

The MCP interface exposes deterministic workspace tools for agentic clients:

- `bookkit.list_books` / `bookkit.read_book` — discover and read book content
- `bookkit.validate_book` — run schema + frame validation
- `bookkit.check_separation` — verify content boundaries
- `bookkit.compile_book` — trigger build
- `bookkit.create_book` — scaffold a new book

Tool handlers use in-memory validators for speed. The `command-runner.ts` provides a safe fallback when child process spawning is unavailable (e.g. edge runtimes).

---

## Exports

PDF and EPUB generation from structured `ExportBundle` data:

- `createPdfExport(bundle)` — renders headings, paragraphs, callout boxes, and bullet lists
- `createEpubExport(bundle)` — EPUB3 generation
- Export metadata and link helpers for chapter and book-level exports

---

## Astro integration

`src/integration.ts` exports a `bookkit()` Astro integration that:

- configures Vite SSR bundling for the engine package
- suppresses known noisy Rollup warnings
- optionally injects standard API/export routes

```ts
import { bookkit } from "@bookkit/astro-bookkit/integration";

export default defineConfig({
  integrations: [bookkit()],
});
```

---

## Book bootstrap pattern

New books should call the shared engine bootstrap once from a thin local module such as `src/lib/book-runtime.ts`. Keep author decisions in `src/book.config.ts`, and keep the local runtime responsible only for wiring Astro's file-local `import.meta.glob()` entrypoints into the engine.

```ts
import { createBookRuntime } from "@bookkit/astro-bookkit";
import bookConfig from "../book.config";

export const bookRuntime = createBookRuntime({
  bookConfig,
  modules: {
    contentModules: {
      chapters: import.meta.glob("../content/book/chapters/*.mdx", { eager: true }),
      mechanisms: import.meta.glob("../content/book/mechanisms/*.mdx", { eager: true }),
      toolkit: import.meta.glob("../content/book/toolkit/*.mdx", { eager: true }),
      glossary: import.meta.glob("../content/book/glossary/*.mdx", { eager: true }),
      examples: import.meta.glob("../content/book/examples/**/*.mdx", { eager: true }),
    },
    releaseModules: import.meta.glob("../content/book/releases/*.mdx", { eager: true }),
  },
});
```

The resulting `bookRuntime` centralizes common bootstrap concerns:

- content entrypoints (`bookRuntime.bookEntryPoints`)
- release helpers (`bookRuntime.releaseModules`, `bookRuntime.getReleaseNotes()`)
- export helpers (`bookRuntime.getBookExportBundle()`, `bookRuntime.getChapterExportLinks()`)
- OG image helper (`bookRuntime.getOgImageForPath()`)
- API handler setup (`bookRuntime.api.*`)

---

## Route wrapper pattern

Astro's file-based routing means a small set of app-local wrapper files must still exist under `src/pages/**` and `src/lib/**`. Keep those files declarative and route-shaped only:

- `src/lib/book-runtime.ts` — the only place a book calls `createBookRuntime(...)`
- `src/lib/book-entrypoints.ts`, `src/lib/exports.ts`, etc. — re-export shims from `book-runtime`
- `src/pages/api/**` — thin route stubs (Astro discovers endpoints by filename)

Canonical wrapper templates live in `packages/astro-bookkit/templates/book-app/**`. Use `bun run check:shims` to verify app wrappers match the canonical pattern, and `bun run sync:shims` to rewrite them.
