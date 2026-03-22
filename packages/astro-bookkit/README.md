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

Astro route files should stay as thin wrappers around the shared runtime object so only file-path-specific exports remain local.

```ts
import { bookRuntime } from "../../lib/book-runtime";

export const GET = bookRuntime.exportRoutes.book.pdf.GET;
```

```ts
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { bookRuntime } from "../../lib/book-runtime";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const { GET, POST } = bookRuntime.api.createMcpHandlers(currentDir);
```

If you still want compatibility shims such as `src/lib/book-entrypoints.ts` or `src/lib/release-notes.ts`, keep them as re-exports from `bookRuntime` rather than duplicating setup logic.
