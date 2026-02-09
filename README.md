# Bookkit — Recompilable Books (Astro + Bun)

Bookkit is a **book compiler workspace**: one reusable engine + one or more book apps.

> A book is a specification that compiles into coherent reader experiences, not a static pile of chapters.

---

## TL;DR (for developers and agents)

- **Engine logic** lives in `packages/astro-bookkit/**`.
- **Book decisions** live in `apps/<book>/src/book.config.ts`.
- **Book content bindings** live in `apps/<book>/src/content/book/**`.
- Do not put book-specific behavior in content files.
- Run `bun run validate` before opening a PR.

For contribution lanes and workflow, see [`CONTRIBUTING.md`](./CONTRIBUTING.md). For non-negotiable architectural rules, see [`AGENTS.md`](./AGENTS.md).

---

## Documentation map

| Document | Canonical for | Audience |
| --- | --- | --- |
| [`README.md`](./README.md) | Architecture + operational commands | Developers + maintainers |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Contribution workflow + checklists | Human + AI contributors |
| [`AGENTS.md`](./AGENTS.md) | Architectural invariants + risk boundaries | Agents + reviewers |
| [`packages/astro-bookkit/README.md`](./packages/astro-bookkit/README.md) | Engine-local orientation | Engine contributors |
| [`apps/bad-people/README.md`](./apps/bad-people/README.md) | Book-app-local orientation | Book contributors |

Prefer linking to canonical docs over duplicating policy text.

---

## Workspace architecture

Bookkit enforces strict separation of concerns:

1. **Author decisions (scarce + irreversible)**  
   `apps/<book>/src/book.config.ts`
2. **Engine/compiler logic (reusable)**  
   `packages/astro-bookkit/**`
3. **Replaceable bindings (book content)**  
   `apps/<book>/src/content/book/**`

This keeps books recompilable while allowing iterative content edits.

### Repo layout

```txt
.
├─ package.json
├─ apps/
│  └─ bad-people/
│     ├─ src/book.config.ts
│     └─ src/content/book/
│        ├─ chapters/
│        ├─ mechanisms/
│        ├─ toolkit/
│        ├─ examples/
│        ├─ glossary/
│        └─ releases/
├─ packages/
│  └─ astro-bookkit/
│     └─ src/
│        ├─ compiler/
│        ├─ frames/
│        ├─ schemas/
│        └─ validators/
└─ scripts/
```

---

## Prerequisites

- **Bun** (workspace package manager + task runner)
- **Node.js 18.17+** (recommended 20+) for Astro 5 compatibility

Install dependencies:

```bash
bun install
```

---

## Daily commands

### Run a book app

```bash
bun run dev:bad-people
```

### Lint / format / types

```bash
bun run lint
bun run format
bun run check:types
```

### Validation

```bash
bun run validate
bun run validate:release
```

### Full upgrade safety net

```bash
bun run check:upgrade
bun run check:upgrade -- --release
```

### Build / compile / export

```bash
bun run build:all
bun run compile:book -- --book bad-people
bun run export:gitbook -- --book bad-people
```

### Helpful utilities

```bash
bun run list:books
bun run check:separation
bun run check:concepts
bun run stack:capabilities
```

---

## How compile-time governance works

Bookkit uses validation + frame enforcement to prevent drift:

```txt
content + book.config.ts
        │
        ▼
schema validation
        │
        ▼
frame checks + ordering constraints
        │
        ▼
compiler outputs (read UI, APIs, exports)
```

Validation should fail with **actionable errors** (what failed, where, and how to fix).

---

## Create a new book

Use the scaffold command (defaults to template `bad-people`):

```bash
bun run new:book -- --book <new-book> --title "Your Book Title"
```

Then:

1. Update `apps/<new-book>/src/book.config.ts`.
2. Replace starter content under `src/content/book/**`.
3. Run `bun run validate` and `bun run validate:release`.
4. Compile with `bun run compile:book -- --book <new-book> --mode error --no-drafts`.

Do not fork the engine to customize one book.

---

## Contribution model

- Content edits and examples are welcome.
- Engine/frame/schema changes are higher-risk and require tighter review.
- If you touch validation behavior, keep errors actionable and document migration impact.

See detailed lanes/checklists in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## License

Add license here.
