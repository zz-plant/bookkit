# @bookkit/astro-bookkit

A compiler engine for **recompilable books**: structured content that the checks validate against pedagogical frames, and that agents can read and check through MCP.

Most documentation tools treat content as static files that render into HTML. Bookkit treats a book as an **executable specification**: a set of declared mechanisms, enforceable structural frames, and graph-ordered content that compiles into reader experiences while staying human-editable.

Built on Astro 7, Zod, and Bun.

---

## Why this exists

Documentation systems are good at rendering markdown. They're bad at answering:

- "Does this chapter actually cover the frame steps it claims to?"
- "Are these mechanisms properly bounded, or drifting into prose?"
- "Can a depleted reader take a concrete action in under 10 minutes?"

Bookkit adds governance to content: `bun run validate` and `bun run verify` check structure, not just syntax, and `bookkit deploy` refuses a book that fails them. `bookkit build` builds drafts with errors, so the build itself is not the gate.

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

A **frame** is a declared sequence of structural steps (e.g. Recognition → Exoneration → Mechanism → Agency). The validator checks that required steps are structurally present in chapter headings — not implied in prose. A heading counts for a step when its whole text slugs to the step's id, as the site slugs heading ids: `## Failure Modes` counts for `failure-modes`.

```ts
import { defaultFrames, frameStepsInPage, validateFrameSteps } from "@bookkit/astro-bookkit";

const [intervention] = defaultFrames;
const present = frameStepsInPage(intervention, "## Recognition\n\n## Exoneration\n");
const result = validateFrameSteps(intervention, present);
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
- **PDF/EPUB export** of the whole book (chapters, then each mechanism followed by its toolkit actions, then the glossary and examples), with a contents page and bookmarks; metadata comes from `book.config.ts` and the latest release note, so rebuilding unchanged content gives identical files. Both show inline and fenced code (Courier in the PDF), GFM tables (in the PDF a grid that fits the page, or row by row when the columns would be too narrow), reference-style links, footnotes (EPUB endnotes that link back; in the PDF, numbered notes after each entry), HTML character references, nested lists, task lists, fenced code at any indentation, setext headings and rules, and the HTML elements import keeps (`<kbd>`, `<details>`, `<sup>`, HTML tables and lists…; any other tag shows only its text). Headings carry the ids the site gives them, so links to a heading land on it. A link whose scheme is not http, https, mailto, tel, or ftp shows only its text. In the PDF, bold and italic text use bold and italic faces, and links are clickable: to a chapter, mechanism, or heading inside the PDF, else to the site. Both carry the book's PNG and JPEG images (the EPUB also GIF, SVG, and WebP); an image the format cannot carry, or one at a URL, shows its alt text and the build warns. The PDF draws Western European text in Helvetica and Latin Extended, Greek, and Cyrillic in embedded Noto Sans subsets; `exports.pdfFont` adds a font for other scripts, and `exports.pdf: false` builds the book without a PDF
- **MCP endpoint** for AI-agent integration (validate, read, list, compile)
- **Astro integration** (`bookkit()`) for zero-config setup
- **Search index** generation and query engine
- **Localization** support with locale routing and completeness tracking
- **Release notes** with versioning, RSS, and webhook support

---

## Quick start

The package is not published to npm. Start a book in this workspace with `bun run bookkit new book <slug>`, or a standalone project with the engine copied in with `bun run create-bookkit <folder>` from a clone (see [`packages/create-bookkit/README.md`](../create-bookkit/README.md)). Either way the book app's `astro.config.mjs` adds the `bookkit()` integration from `@bookkit/astro-bookkit/integration`, and `src/book.config.ts` is typed `as const satisfies BookConfig`.

Content goes in `src/content/book/` as MDX files with typed frontmatter. Run `bun run bookkit dev` to iterate and `bun run bookkit check` to check structure; the root [`README.md`](../../README.md) covers every command.

---

## Testing

```bash
bun test
```

Test files sit beside the modules they cover: the graph engine, schema validation, frame enforcement, search ranking, keyboard shortcuts, MCP handlers, export generation, and more. From the workspace root, `bun run test` runs them with the rest of the workspace's tests.

---

## License

CC0 1.0 Universal — public domain.

The PDF export embeds subsets of Noto Sans, which the `@fontsource/noto-sans` dependency installs under the SIL Open Font License 1.1 (its `LICENSE` file). The OFL allows embedding the font in documents and distributing those documents under any license; the font files are not part of this package.
