# create-bookkit

Scaffold a recompilable book project. You get a structured-content book whose
meaning is checked by a compiler, not agreed on by vibes:

- mechanisms, toolkit actions, examples, glossary, and releases as typed records
- enforceable frames (`intervention`, `runbook`) with mandated step headings
- constraint-graph ordering instead of a single canonical sequence
- tooling that keeps AI-generated drafts inside the schema (`validate`, `suggest`, `runbooks`)

## Usage

```bash
bunx create-bookkit my-book \
  --book <slug> \
  --title "My Book Title" \
  --dir ./existing-notes
```

Actually, with this package the engine and template are copied into your
project (vendored), so it also works without publishing:

```bash
# from inside the bookkit repo
bun run packages/create-bookkit/src/index.ts ./my-book --book runbook-guide
```

Then:

```bash
cd my-book
bun install
bun run validate
bun run dev
```

## What you get

| Path | Role |
| --- | --- |
| `apps/<book>/src/content/book/**` | author decisions (mechanisms, toolkit, chapters, examples) |
| `apps/<book>/src/book.config.ts` | the book's config: frame, objectives, constraints |
| `packages/astro-bookkit/` | the compiler engine, vendored |

## Enabling the runbook frame

Bookkit ships a `runbook` frame: required steps, tool↔mechanism coverage,
drill ownership, and escalation wiring, audited by `bun run runbooks`:

- set `frame.slug: "runbook"` in `src/book.config.ts`
- keep the required step headings in `00-overview.mdx` (`ownership`, `trigger`, `steps`, `escalation`, `verification`)
- give each tool an `owner`, `drills`, and `escalation` in frontmatter

## AI Q&A

Off by default (keeps the install lean). To enable: set `features.aiQa: true`
and run `bun add @xenova/transformers` inside the vendored engine folder.

## License

CC0-1.0