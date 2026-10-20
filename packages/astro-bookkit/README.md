# @bookkit/astro-bookkit

A compiler engine for **recompilable books** — structured content that validates at build time, enforces pedagogical frames, and stays agentic.

Most documentation tools treat content as static files that render into HTML. Bookkit treats a book as an **executable specification**: a set of declared mechanisms, enforceable structural frames, and graph-ordered content that compiles into reader experiences while staying human-editable.

Built on Astro 7, Zod, and Bun.

---

## Why this exists

Documentation systems are good at rendering markdown. They're bad at answering:

- "Does this chapter actually cover the frame steps it claims to?"
- "Are these mechanisms properly bounded, or drifting into prose?"
- "Can a depleted reader take a concrete action in under 10 minutes?"

Bookkit adds compile-time governance to content. Every build validates structure, not just syntax.

---

## Core primitives

### Schemas (Zod)

Typed frontmatter for every content entity:

```ts
import { mechanismSchema } from "@bookkit/astro-bookkit/schemas";

// Validates: slug, title, definition, is/isNot boundaries, predictions, tests
mechanismSchema.safeParse(frontmatter);
```

Entity types: `mechanism`, `toolkit`, `chapter`, `example`, `glossary`.

### Frame enforcement

A **frame** is a declared sequence of structural steps (e.g. Recognition → Exoneration → Mechanism → Agency). The validator checks that required steps are structurally present in chapter headings — not implied in prose.

```ts
import { validateFrameSteps, defaultFrames } from "@bookkit/astro-bookkit";

const result = validateFrameSteps(defaultFrames[0], headingSlugs);
// result.missingRequiredSteps → ["mechanism", "agency"]
```

### Graph engine

Chapters and mechanisms declare prerequisites. The graph engine detects cycles, computes deterministic topological reading order, and derives reader pathways:

```ts
import { detectCycles, computeTopologicalOrder, deriveReaderPathways } from "@bookkit/astro-bookkit";

const order = computeTopologicalOrder(nodes);
// → ["overview", "recognition", "mechanism", "toolkit"]

const pathways = deriveReaderPathways(nodes);
// → [{ name: "Foundational", slugs: [...] }, { name: "Fast-Path", slugs: [...] }]
```

### Separation validator

Scans content files for violations of the data-only invariant: no imports, no `<script>` tags, no `<style>` tags in content bindings. Enforces the boundary between engine logic and replaceable content.

### In-memory validators

Both the book validator and separation validator run in-memory — no child process spawning. Designed for MCP tool handlers and fast CI:

```ts
import { validateBookInMemory, checkSeparationInMemory } from "@bookkit/astro-bookkit";

const result = validateBookInMemory({ bookSlug: "my-book" });
// result.ok, result.errors[], result.warnings[]
```

---

## Governance model

Bookkit enforces three-layer separation:

| Layer | Owns | Lives |
|---|---|---|
| **Author decisions** | Pedagogical strategy, mechanism boundaries, reader objectives | `apps/<book>/src/book.config.ts` |
| **Engine logic** | Rendering, validation, exports, AI integration | `packages/astro-bookkit/**` |
| **Content bindings** | Replaceable chapters, examples, glossary, tools | `apps/<book>/src/content/book/**` |

**Hard rule:** never implement book-specific logic inside content files. If behavior is needed, implement it as an engine capability or express it as a frame/config option.

This separation means engine upgrades (new export formats, AI features, MCP tools) propagate to all books without touching content.

---

## What's in the box

- **Zod schemas** for structured content entities
- **Frame validator** with registered frame definitions
- **Graph engine** with cycle detection, topological sort, and pathway derivation
- **PDF/EPUB export** of the whole book (chapters, then each mechanism followed by its toolkit actions, then the glossary and examples), with a contents page and bookmarks; metadata comes from `book.config.ts` and the latest release note, so rebuilding unchanged content gives identical files. Both show inline and fenced code (Courier in the PDF), GFM tables (in the PDF a grid that fits the page, or row by row when the columns would be too narrow), reference-style links, footnotes (EPUB endnotes that link back; in the PDF, numbered notes after each entry), and HTML character references. Both carry the book's PNG and JPEG images (the EPUB also GIF, SVG, and WebP); an image the format cannot carry, or one at a URL, shows its alt text and the build warns. The PDF draws Western European text in Helvetica and Latin Extended, Greek, and Cyrillic in embedded Noto Sans subsets; `exports.pdfFont` adds a font for other scripts, and `exports.pdf: false` builds the book without a PDF
- **MCP endpoint** for AI-agent integration (validate, read, list, compile)
- **Astro integration** (`bookkit()`) for zero-config setup
- **Search index** generation and query engine
- **Localization** support with locale routing and completeness tracking
- **Release notes** with versioning, RSS, and webhook support
- **25 test suites** covering graph, schemas, validators, search, keyboard shortcuts, and more

---

## Quick start

```bash
bun create astro my-book
cd my-book
bun add @bookkit/astro-bookkit
```

```ts
// astro.config.mjs
import { bookkit } from "@bookkit/astro-bookkit/integration";
export default defineConfig({
  integrations: [bookkit()],
});
```

```ts
// src/book.config.ts
export const bookConfig = {
  slug: "my-book",
  title: "My Book",
  frame: {
    slug: "intervention",
    steps: ["recognition", "exoneration", "mechanism", "agency"],
    intent: "Move readers from recognition to agency.",
  },
};
```

Content goes in `src/content/book/` as MDX files with typed frontmatter. Run `bun run dev` to iterate, `bun run validate` to check structure.

---

## Testing

```bash
bun test
```

25 test suites covering the graph engine, schema validation, frame enforcement, search ranking, keyboard shortcuts, MCP handlers, and export generation.

---

## License

CC0 1.0 Universal — public domain.

The PDF export embeds subsets of Noto Sans, which the `@fontsource/noto-sans` dependency installs under the SIL Open Font License 1.1 (its `LICENSE` file). The OFL allows embedding the font in documents and distributing those documents under any license; the font files are not part of this package.
