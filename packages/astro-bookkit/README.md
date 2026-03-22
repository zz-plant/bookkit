# Astro Bookkit (Engine Package)

This package contains the reusable, book-agnostic compiler engine.

## What belongs here

- frames and structural requirements
- schemas and validation rules
- compiler/orchestration utilities
- shared components/styles reused by multiple books

## What does not belong here

- book-specific narrative content
- one-off behavior for a single title
- content-level hacks that should be modeled as schema/frame rules

## Canonical docs

- Architecture + commands: [`../../README.md`](../../README.md)
- Contribution workflow: [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)
- Invariants + guardrails: [`../../AGENTS.md`](../../AGENTS.md)

Keep this README local in scope; link outward for policy.

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
    contentRawModules: {
      chapters: import.meta.glob<string>("../content/book/chapters/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      mechanisms: import.meta.glob<string>("../content/book/mechanisms/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      toolkit: import.meta.glob<string>("../content/book/toolkit/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      glossary: import.meta.glob<string>("../content/book/glossary/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
      examples: import.meta.glob<string>("../content/book/examples/**/*.mdx", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
    },
    releaseModules: import.meta.glob("../content/book/releases/*.mdx", { eager: true }),
  },
});
```

The resulting `bookRuntime` centralizes common bootstrap concerns:

- content entrypoints (`bookRuntime.bookEntryPoints`)
- release helpers (`bookRuntime.releaseModules`, `bookRuntime.getReleaseNotes()`, `bookRuntime.getVersionEntries()`)
- export helpers (`bookRuntime.getBookExportBundle()`, `bookRuntime.getChapterExportLinks()`, `bookRuntime.exportRoutes`)
- OG helper (`bookRuntime.getOgImageForPath()`)
- API handler setup (`bookRuntime.api.*`)

## Route wrapper pattern

Astro's file-based routing means a small set of app-local wrapper files must still exist under `src/pages/**` and `src/lib/**`. Keep those files declarative and route-shaped only:

- `src/lib/book-runtime.ts` is the only place a book should call `createBookRuntime(...)`, because Astro/Vite require the local `import.meta.glob()` entrypoints to stay in the app.
- `src/lib/book-entrypoints.ts`, `src/lib/exports.ts`, `src/lib/og.ts`, `src/lib/release-notes.ts`, and `src/lib/versions.ts` should be re-export shims from `book-runtime`.
- `src/pages/api/**` and `src/pages/exports/**` must remain as thin route stubs because Astro discovers those endpoints by filename.

The shared engine now provides `createBookAppShims(bookRuntime)` so app-local wrappers only alias runtime helpers instead of repeating setup.

```ts
import { createBookAppShims, createBookRuntime } from "@bookkit/astro-bookkit";

import bookConfig from "../book.config";

export const bookRuntime = createBookRuntime({ ... });

export const {
  bookEntryPoints,
  createMcpApiHandlers,
  analyticsApiHandlers,
  bookPdfExportRoute,
} = createBookAppShims(bookRuntime);
```

Static shim files should stay one-line re-exports whenever possible.

```ts
export { bookPdfExportGet as GET } from "../../lib/book-runtime";
```

The MCP wrapper still needs a tiny local call because `import.meta.url` is file-local, but no longer needs custom path boilerplate.

```ts
import { createMcpApiHandlers } from "../../lib/book-runtime";

export const { GET, POST } = createMcpApiHandlers(import.meta.url);
```

Canonical wrapper templates live in `packages/astro-bookkit/templates/book-app/**`. Use `bun run check:shims` to verify app wrappers still match the canonical pattern, and `bun run sync:shims` to rewrite them from the template source.
